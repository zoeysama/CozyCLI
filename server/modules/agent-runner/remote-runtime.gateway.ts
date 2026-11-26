import { randomUUID } from 'node:crypto';
import net, { type Socket } from 'node:net';

import { chatRunRegistry, type ProviderRuntimeGateway } from '@/modules/websocket/index.js';
import type { AnyRecord, LLMProvider, ProviderPermissionDecision, ProviderRuntimeWriter } from '@/shared/types.js';

import {
  AGENT_RUNNER_PROTOCOL,
  readMessages,
  writeMessage,
  type RunnerMessage,
  type RunnerRunInfo,
} from './agent-runner.protocol.js';

const RECONNECT_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 15_000;

type RunBinding = {
  writer: ProviderRuntimeWriter;
  /** Settles the run() promise of a run this UI dispatched; absent for adopted runs. */
  settle?: (error: string | null) => void;
  /** Adopted after a UI restart: completion is ours to record. */
  adopted?: ReturnType<typeof chatRunRegistry.startRun>;
};

/**
 * CozyCLI: the Web UI's runtime gateway when an agent runner is configured.
 *
 * Same interface as providerRuntimeService, so chat and scheduled messages
 * need no changes. Runs go to the runner process, which owns the agent
 * processes and survives UI restarts; on (re)connect the UI re-adopts the
 * runner's live runs into its run registry so the browser sees them as
 * running again. If the runner is unreachable, runs fall back to the local
 * (in-process) runtime so the UI stays usable.
 */
export function createRemoteRuntimeGateway(local: ProviderRuntimeGateway, socketPath: string): ProviderRuntimeGateway & { isConnected(): boolean; close(): void } {
  const uiId = randomUUID();
  const bindings = new Map<string, RunBinding>();
  const requests = new Map<number, (reply: RunnerMessage | null) => void>();
  /** Which side runs a session's current turn, so abort/steer go to the right place. */
  const owner = new Map<string, 'remote' | 'local'>();
  let background = new Set<string>();
  let pending: Record<string, unknown[]> = {};
  let socket: Socket | null = null;
  let connected = false;
  let nextId = 1;
  let closed = false;

  const request = (message: RunnerMessage): Promise<RunnerMessage | null> => {
    const id = nextId++;
    return new Promise((resolve) => {
      if (!connected || !writeMessage(socket, { ...message, id })) {
        resolve(null);
        return;
      }
      const timer = setTimeout(() => { requests.delete(id); resolve(null); }, REQUEST_TIMEOUT_MS);
      timer.unref();
      requests.set(id, (reply) => { clearTimeout(timer); resolve(reply); });
    });
  };

  const adopt = (runs: RunnerRunInfo[]) => {
    for (const info of runs) {
      if (bindings.has(info.runId) || !info.appSessionId) continue;
      const run = chatRunRegistry.startRun({
        appSessionId: info.appSessionId,
        provider: info.provider as LLMProvider,
        providerSessionId: info.providerSessionId,
        connection: null,
        userId: info.userId,
      });
      if (!run) continue;
      bindings.set(info.runId, { writer: run.writer, adopted: run });
      owner.set(info.appSessionId, 'remote');
      if (info.done) chatRunRegistry.completeRunIfCurrent(run, { exitCode: 0 });
      console.log(`[agent-runner] re-adopted run for session ${info.appSessionId}${info.done ? ' (finished, background work)' : ''}`);
    }
  };

  const onMessage = (message: RunnerMessage) => {
    switch (message.op) {
      case 'reply': {
        const resolve = requests.get(Number(message.id));
        if (resolve) { requests.delete(Number(message.id)); resolve(message); }
        break;
      }
      case 'event':
        bindings.get(String(message.runId))?.writer.send(message.data);
        break;
      case 'sessionId':
        bindings.get(String(message.runId))?.writer.setSessionId?.(String(message.sessionId));
        break;
      case 'runDone': {
        const binding = bindings.get(String(message.runId));
        binding?.settle?.((message.error as string | null) ?? null);
        if (binding) binding.settle = undefined;
        if (binding?.adopted) chatRunRegistry.completeRunIfCurrent(binding.adopted, { exitCode: message.error ? 1 : 0 });
        break;
      }
      case 'state':
        background = new Set((message.background as string[]) ?? []);
        pending = (message.pending as Record<string, unknown[]>) ?? {};
        break;
      default:
        break;
    }
  };

  const connect = () => {
    const attempt = net.createConnection(socketPath);
    attempt.on('connect', async () => {
      socket = attempt;
      connected = true;
      readMessages(attempt, onMessage);
      const hello = await request({ op: 'hello', uiId });
      if (hello?.protocol !== AGENT_RUNNER_PROTOCOL) {
        console.error(`[agent-runner] protocol mismatch (runner ${String(hello?.protocol)}, UI ${AGENT_RUNNER_PROTOCOL}); using local runs`);
        attempt.destroy();
        return;
      }
      adopt((hello.runs as RunnerRunInfo[]) ?? []);
      console.log(`[agent-runner] connected to ${socketPath}`);
    });
    attempt.on('error', () => { /* close follows */ });
    attempt.on('close', () => {
      const wasConnected = socket === attempt;
      if (wasConnected) {
        socket = null;
        connected = false;
        for (const resolve of requests.values()) resolve(null);
        requests.clear();
        // Runs this UI was awaiting cannot report any more; let chat settle them.
        for (const binding of bindings.values()) {
          binding.settle?.('The agent runner disconnected.');
          binding.settle = undefined;
        }
        bindings.clear();
        background = new Set();
        pending = {};
        console.warn('[agent-runner] disconnected; retrying');
      }
      if (!closed) setTimeout(connect, RECONNECT_DELAY_MS).unref();
    });
  };
  connect();

  const ownerOf = (sessionId: string) => owner.get(sessionId) ?? (connected ? 'remote' : 'local');

  return {
    isConnected: () => connected,
    close() {
      closed = true;
      socket?.destroy();
    },
    hasRuntime: (provider) => local.hasRuntime(provider),
    askSideQuestion: (provider, sideRequest, sink) => local.askSideQuestion(provider, sideRequest, sink),

    run(provider: LLMProvider, command: string, options: AnyRecord, writer: ProviderRuntimeWriter) {
      const sessionId = String(options.sessionId ?? '');
      if (!connected) {
        owner.set(sessionId, 'local');
        return local.run(provider, command, options, writer);
      }
      owner.set(sessionId, 'remote');
      const runId = randomUUID();
      return new Promise((resolve, reject) => {
        bindings.set(runId, {
          writer,
          settle: (error) => (error ? reject(new Error(error)) : resolve(undefined)),
        });
        writeMessage(socket, { op: 'run', runId, provider, command, options, userId: writer.userId ?? null });
      });
    },

    async abort(provider, sessionId) {
      if (ownerOf(sessionId) === 'local') return local.abort(provider, sessionId);
      return Boolean((await request({ op: 'abort', provider, sessionId }))?.result);
    },

    async stopBackgroundTask(provider, sessionId, taskId) {
      if (ownerOf(sessionId) === 'local') return local.stopBackgroundTask(provider, sessionId, taskId);
      return Boolean((await request({ op: 'stopTask', provider, sessionId, taskId }))?.result);
    },

    async steer(provider, sessionId, command, options) {
      if (ownerOf(sessionId) === 'local') return local.steer(provider, sessionId, command, options);
      return Boolean((await request({ op: 'steer', provider, sessionId, command, options }))?.result);
    },

    hasBackgroundWork: (sessionId) => background.has(sessionId) || local.hasBackgroundWork(sessionId),

    resolveToolApproval(requestId: string, payload: ProviderPermissionDecision) {
      // The id is unique, so whichever side issued it acts and the other ignores it.
      if (connected) writeMessage(socket, { op: 'approve', requestId, payload });
      local.resolveToolApproval(requestId, payload);
    },

    getPendingApprovalsForSession: (sessionId) => [
      ...(pending[sessionId] ?? []),
      ...local.getPendingApprovalsForSession(sessionId),
    ],
  };
}
