import type { Socket } from 'node:net';

/**
 * CozyCLI: wire protocol between the Web UI server and the agent runner.
 *
 * Newline-delimited JSON over a unix socket. Requests carry an `id` and get
 * exactly one `reply`; everything else is a one-way notification.
 *
 * UI → runner
 *   hello       { uiId }                         → reply { protocol, runs: RunnerRunInfo[] }
 *   run         { runId, provider, command, options, userId }   (fire-and-forget; progress via events)
 *   abort       { provider, sessionId }          → reply { result: boolean }
 *   stopTask    { provider, sessionId, taskId }  → reply { result: boolean }
 *   steer       { provider, sessionId, command, options } → reply { result: boolean }
 *   approve     { requestId, payload }           (fire-and-forget)
 *
 * runner → UI
 *   event       { runId, data }                  one writer.send() of the runtime
 *   sessionId   { runId, sessionId }             one writer.setSessionId()
 *   runDone     { runId, error }                 runtime.run() settled
 *   state       { background: string[], pending: Record<sessionId, unknown[]> }
 */
export const AGENT_RUNNER_PROTOCOL = 1;

/** A run the runner holds, reported on hello so a restarted UI can re-adopt it. */
export type RunnerRunInfo = {
  runId: string;
  appSessionId: string;
  provider: string;
  userId: string | number | null;
  providerSessionId: string | null;
  done: boolean;
};

export type RunnerMessage = Record<string, unknown> & { op: string; id?: number };

/** Splits a socket's byte stream into JSON messages. */
export function readMessages(socket: Socket, onMessage: (message: RunnerMessage) => void): void {
  let buffered = '';
  socket.setEncoding('utf8');
  socket.on('data', (chunk: string) => {
    buffered += chunk;
    let newline = buffered.indexOf('\n');
    while (newline >= 0) {
      const line = buffered.slice(0, newline);
      buffered = buffered.slice(newline + 1);
      if (line.trim()) {
        try {
          onMessage(JSON.parse(line) as RunnerMessage);
        } catch (error) {
          console.warn('[agent-runner] dropped an unreadable message', error);
        }
      }
      newline = buffered.indexOf('\n');
    }
  });
}

/** Writes one message; false when the socket is gone. */
export function writeMessage(socket: Socket | null, message: RunnerMessage): boolean {
  if (!socket || socket.destroyed || !socket.writable) return false;
  socket.write(`${JSON.stringify(message)}\n`);
  return true;
}
