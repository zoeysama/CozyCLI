import type { ProviderRuntimeGateway } from '@/modules/websocket/index.js';

import { createRemoteRuntimeGateway } from './remote-runtime.gateway.js';

// startAgentRunnerHost: used by server/runner.ts, the agent runner's entry point.
export { startAgentRunnerHost } from './agent-runner.host.js';

/**
 * CozyCLI: used by the server entrypoint to pick the chat runtime. With
 * AGENT_RUNNER_SOCKET set, runs go to the agent runner process (agents survive
 * UI restarts); without it, upstream's in-process runtime is used unchanged.
 */
export function createRuntimeGateway(local: ProviderRuntimeGateway): ProviderRuntimeGateway {
  const socketPath = process.env.AGENT_RUNNER_SOCKET;
  if (!socketPath) return local;
  console.log(`[agent-runner] chat runs go to the agent runner at ${socketPath}`);
  return createRemoteRuntimeGateway(local, socketPath);
}
