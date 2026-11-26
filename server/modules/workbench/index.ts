import { createWorkbenchRouter } from '@/modules/workbench/workbench.routes.js';
import { workbenchService } from '@/modules/workbench/workbench.service.js';

// workbenchRoutes: CozyCLI addition, mounted by the server entrypoint at /api/workbench
// for project identity, session tags, workbench settings and quick sessions.
export const workbenchRoutes = createWorkbenchRouter(workbenchService);
