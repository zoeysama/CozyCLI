#!/usr/bin/env node
// CozyCLI: the agent runner — owns every provider run and its agent processes so
// they survive Web UI restarts. The UI connects over AGENT_RUNNER_SOCKET.
import './load-env.js';

import { initializeDatabase } from './modules/database/index.js';
import { configureWebPush } from './modules/notifications/index.js';
import { providerRuntimeService } from './modules/providers/index.js';
import { startAgentRunnerHost } from './modules/agent-runner/index.js';

const socketPath = process.env.AGENT_RUNNER_SOCKET;
if (!socketPath) {
  console.error('[agent-runner] AGENT_RUNNER_SOCKET is not set');
  process.exit(1);
}

await initializeDatabase();
// Runtimes send run notifications themselves.
configureWebPush();

const host = startAgentRunnerHost(providerRuntimeService, socketPath);
await host.listen();

const shutdown = () => {
  host.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
