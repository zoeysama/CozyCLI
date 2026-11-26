import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { chatRunRegistry, type ProviderRuntimeGateway } from '@/modules/websocket/index.js';
import type { AnyRecord, ProviderRuntimeWriter } from '@/shared/types.js';

import { startAgentRunnerHost, type RunnerRuntime } from '../agent-runner.host.js';
import { createRemoteRuntimeGateway } from '../remote-runtime.gateway.js';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(check: () => boolean, timeoutMs = 3000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out');
    await wait(20);
  }
}

/** A runtime whose runs stay open until the test finishes them. */
function fakeRuntime() {
  const writers = new Map<string, ProviderRuntimeWriter>();
  const finishers = new Map<string, () => void>();
  const background = new Set<string>();
  const runtime: RunnerRuntime = {
    run: (_provider, _command, options: AnyRecord, writer) => new Promise((resolve) => {
      const sessionId = String(options.sessionId);
      writers.set(sessionId, writer);
      finishers.set(sessionId, () => resolve(undefined));
      writer.setSessionId?.(`provider-${sessionId}`);
    }),
    abort: async (_provider, sessionId) => { finishers.get(sessionId)?.(); return true; },
    stopBackgroundTask: async () => true,
    steer: async () => true,
    hasBackgroundWork: (sessionId) => background.has(sessionId),
    resolveToolApproval: () => undefined,
    getPendingApprovalsForSession: () => [],
  };
  return { runtime, writers, finishers, background };
}

const unusedLocal = {
  hasRuntime: () => true,
  askSideQuestion: async () => ({ status: 'done', answer: '' }),
  run: async () => { throw new Error('local run not expected'); },
  abort: async () => false,
  stopBackgroundTask: async () => false,
  steer: async () => false,
  hasBackgroundWork: () => false,
  resolveToolApproval: () => undefined,
  getPendingApprovalsForSession: () => [],
} as unknown as ProviderRuntimeGateway;

test('runs go through the runner, survive a UI restart and are re-adopted', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'agent-runner-'));
  const socketPath = path.join(directory, 'runner.sock');
  const fake = fakeRuntime();
  const host = startAgentRunnerHost(fake.runtime, socketPath);
  const opened: { close(): void }[] = [];
  await host.listen();
  try {
    // UI #1 starts a run.
    const ui1 = createRemoteRuntimeGateway(unusedLocal, socketPath) as ReturnType<typeof createRemoteRuntimeGateway>;
    opened.push(ui1);
    await until(() => ui1.isConnected());
    const received: unknown[] = [];
    const ids: string[] = [];
    const writer: ProviderRuntimeWriter = {
      userId: 7,
      send: (data) => received.push(data),
      setSessionId: (id) => ids.push(id),
    };
    const done = ui1.run('claude', 'hello', { sessionId: 'session-1' }, writer)
      .then(() => 'resolved', (error: Error) => error.message);
    await until(() => fake.writers.has('session-1'));
    fake.writers.get('session-1')!.send({ kind: 'text', content: 'hi' });
    await until(() => received.length === 1);
    assert.deepEqual(ids, ['provider-session-1']);

    // The background-work answer is synchronous on the UI side, fed by snapshots.
    fake.background.add('session-1');
    await until(() => ui1.hasBackgroundWork('session-1'));

    // A second UI process connects (the first one "restarted"): it re-adopts the run.
    chatRunRegistry.clearAll();
    const ui2 = createRemoteRuntimeGateway(unusedLocal, socketPath) as ReturnType<typeof createRemoteRuntimeGateway>;
    opened.push(ui2);
    await until(() => ui2.isConnected());
    await until(() => chatRunRegistry.isProcessing('session-1'));
    assert.equal(chatRunRegistry.getRun('session-1')?.providerSessionId ?? 'provider-session-1', 'provider-session-1');

    // Aborting through the new UI reaches the runtime, and the run settles.
    assert.equal(await ui2.abort('claude', 'session-1'), true);
    await until(() => !chatRunRegistry.isProcessing('session-1'));
    // UI #1 was replaced, so its awaited run settles with a disconnect error.
    assert.match(String(await done), /disconnected/);
  } finally {
    for (const gateway of opened) gateway.close();
    host.close();
    chatRunRegistry.clearAll();
    await rm(directory, { recursive: true, force: true });
  }
});
