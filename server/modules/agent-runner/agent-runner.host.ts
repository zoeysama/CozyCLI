import { promises as fs } from 'node:fs';
import net, { type Socket } from 'node:net';
import path from 'node:path';

import type { AnyRecord, LLMProvider, ProviderPermissionDecision, ProviderRuntimeWriter } from '@/shared/types.js';

import {
  AGENT_RUNNER_PROTOCOL,
  readMessages,
  writeMessage,
  type RunnerMessage,
  type RunnerRunInfo,
} from './agent-runner.protocol.js';

/** The subset of providerRuntimeService the runner drives. */
export type RunnerRuntime = {
  run(provider: LLMProvider, command: string, options: AnyRecord, writer: ProviderRuntimeWriter): Promise<unknown>;
  abort(provider: LLMProvider, sessionId: string): Promise<boolean>;
  stopBackgroundTask(provider: LLMProvider, sessionId: string, taskId: string): Promise<boolean>;
  steer(provider: LLMProvider, sessionId: string, command: string, options: AnyRecord): Promise<boolean>;
  hasBackgroundWork(sessionId: string): boolean;
  resolveToolApproval(requestId: string, payload: ProviderPermissionDecision): void;
  getPendingApprovalsForSession(sessionId: string): unknown[];
};

type HostedRun = RunnerRunInfo & {
  /** Events produced while no UI was connected; flushed to the same UI on reconnect. */
  backlog: RunnerMessage[];
  doneAt: number | null;
};

const MAX_BACKLOG = 5000;
const STATE_PUSH_INTERVAL_MS = 500;
/** How long a finished run without background work is still reported on hello. */
const DONE_RUN_RETENTION_MS = 10 * 60 * 1000;

/**
 * CozyCLI: the agent runner. Owns every provider run (and so every agent
 * process) and outlives Web UI restarts; the UI talks to it over a unix
 * socket. One UI connection at a time: a newer one replaces the older.
 */
export function startAgentRunnerHost(runtime: RunnerRuntime, socketPath: string) {
  const runs = new Map<string, HostedRun>();
  let ui: Socket | null = null;
  let uiId: string | null = null;
  let lastState = '';

  const emit = (run: HostedRun, message: RunnerMessage) => {
    if (!writeMessage(ui, message)) {
      run.backlog.push(message);
      if (run.backlog.length > MAX_BACKLOG) run.backlog.splice(0, run.backlog.length - MAX_BACKLOG);
    }
  };

  const startRun = (message: RunnerMessage) => {
    const runId = String(message.runId);
    const options = (message.options ?? {}) as AnyRecord;
    const run: HostedRun = {
      runId,
      appSessionId: String(options.sessionId ?? ''),
      provider: String(message.provider),
      userId: (message.userId ?? null) as string | number | null,
      providerSessionId: null,
      done: false,
      doneAt: null,
      backlog: [],
    };
    runs.set(runId, run);

    // Stays usable after run() settles: background work keeps reporting through it.
    const writer: ProviderRuntimeWriter = {
      userId: run.userId,
      isWebSocketWriter: true,
      send: (data: unknown) => emit(run, { op: 'event', runId, data }),
      setSessionId: (sessionId: string) => {
        run.providerSessionId = sessionId;
        emit(run, { op: 'sessionId', runId, sessionId });
      },
    };

    runtime.run(run.provider as LLMProvider, String(message.command ?? ''), options, writer)
      .then(() => null, (error: unknown) => (error instanceof Error ? error.message : String(error)))
      .then((error) => {
        run.done = true;
        run.doneAt = Date.now();
        emit(run, { op: 'runDone', runId, error });
      });
  };

  const reply = (socket: Socket, id: number | undefined, payload: Record<string, unknown>) => {
    writeMessage(socket, { op: 'reply', id, ...payload });
  };

  const handle = async (socket: Socket, message: RunnerMessage) => {
    const provider = String(message.provider ?? '') as LLMProvider;
    const sessionId = String(message.sessionId ?? '');
    try {
      switch (message.op) {
        case 'hello': {
          const previousUi = ui;
          ui = socket;
          if (previousUi && previousUi !== socket) previousUi.destroy();
          const sameUi = uiId !== null && uiId === message.uiId;
          uiId = String(message.uiId ?? '');
          const reported = [...runs.values()].filter((run) => !run.done || runtime.hasBackgroundWork(run.appSessionId)
            || (run.doneAt !== null && Date.now() - run.doneAt < DONE_RUN_RETENTION_MS));
          reply(socket, message.id, {
            protocol: AGENT_RUNNER_PROTOCOL,
            runs: reported.map(({ backlog: _backlog, doneAt: _doneAt, ...info }) => info),
          });
          // The same UI process reconnecting (a socket blip) still has its run
          // records, so it gets what it missed. A new UI process re-adopts the
          // runs and reloads history from disk instead.
          for (const run of runs.values()) {
            const backlog = run.backlog.splice(0);
            if (sameUi) for (const queued of backlog) writeMessage(socket, queued);
          }
          lastState = '';
          break;
        }
        case 'run':
          startRun(message);
          break;
        case 'abort':
          reply(socket, message.id, { result: await runtime.abort(provider, sessionId) });
          break;
        case 'stopTask':
          reply(socket, message.id, { result: await runtime.stopBackgroundTask(provider, sessionId, String(message.taskId)) });
          break;
        case 'steer':
          reply(socket, message.id, {
            result: await runtime.steer(provider, sessionId, String(message.command ?? ''), (message.options ?? {}) as AnyRecord),
          });
          break;
        case 'approve':
          runtime.resolveToolApproval(String(message.requestId), message.payload as ProviderPermissionDecision);
          break;
        default:
          reply(socket, message.id, { error: `unknown op ${message.op}` });
      }
    } catch (error) {
      reply(socket, message.id, { error: error instanceof Error ? error.message : String(error) });
    }
  };

  // Synchronous runtime answers (background work, pending approvals) are
  // pushed to the UI as a snapshot whenever they change.
  const stateTimer = setInterval(() => {
    const sessions = new Set([...runs.values()].map((run) => run.appSessionId).filter(Boolean));
    const background = [...sessions].filter((id) => runtime.hasBackgroundWork(id));
    const pending: Record<string, unknown[]> = {};
    for (const id of sessions) {
      const list = runtime.getPendingApprovalsForSession(id);
      if (list.length) pending[id] = list;
    }
    const state = JSON.stringify({ background, pending });
    if (state !== lastState && writeMessage(ui, { op: 'state', background, pending })) lastState = state;

    // Forget finished runs nothing is reporting through any more.
    for (const [runId, run] of runs) {
      if (run.done && run.doneAt !== null && Date.now() - run.doneAt > DONE_RUN_RETENTION_MS
        && !runtime.hasBackgroundWork(run.appSessionId)) {
        runs.delete(runId);
      }
    }
  }, STATE_PUSH_INTERVAL_MS);

  const server = net.createServer((socket) => {
    readMessages(socket, (message) => { void handle(socket, message); });
    socket.on('close', () => { if (ui === socket) ui = null; });
    socket.on('error', () => { /* close follows */ });
  });

  const listen = async () => {
    await fs.mkdir(path.dirname(socketPath), { recursive: true });
    await fs.rm(socketPath, { force: true });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(socketPath, () => resolve());
    });
    await fs.chmod(socketPath, 0o600);
    console.log(`[agent-runner] listening on ${socketPath}`);
  };

  return {
    listen,
    close() {
      clearInterval(stateTimer);
      server.close();
    },
    /** For tests and status: the runs currently held. */
    listRuns: () => [...runs.values()].map(({ backlog: _backlog, ...run }) => run),
  };
}
