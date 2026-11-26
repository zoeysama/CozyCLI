import express from 'express';

import type { createWorkbenchService } from '@/modules/workbench/workbench.service.js';
import { sessionStatusService } from '@/modules/workbench/session-status.service.js';

type AuthenticatedRequest = express.Request & { user?: { id?: number | string } };

function userId(req: express.Request): number {
  return Number((req as AuthenticatedRequest).user?.id);
}

/** Creates the thin `/api/workbench` transport around the workbench service. */
export function createWorkbenchRouter(service: ReturnType<typeof createWorkbenchService>): express.Router {
  const router = express.Router();
  const respond = (operation: (req: express.Request) => unknown | Promise<unknown>) =>
    async (req: express.Request, res: express.Response, next: express.NextFunction) => {
      try {
        res.json({ success: true, ...(await operation(req) as object) });
      } catch (error) {
        next(error);
      }
    };

  router.get('/session-status', respond((req) => sessionStatusService.getSessionStatus(userId(req))));
  router.get('/state', respond((req) => service.getState(userId(req))));
  router.patch('/settings', respond((req) => service.saveSettings(userId(req), req.body)));
  router.put('/projects/:projectId/identity', respond((req) => service.setProjectIdentity(
    userId(req), req.params.projectId, req.body,
  )));
  router.put('/sessions/:sessionId/tags', respond((req) => service.setSessionTags(
    userId(req), req.params.sessionId, req.body,
  )));
  router.put('/sessions/:sessionId/viewed', respond((req) => service.markSessionViewed(userId(req), req.params.sessionId)));
  router.put('/tags/:name', respond((req) => service.updateTag(userId(req), req.params.name, req.body)));
  router.delete('/tags/:name', respond((req) => service.deleteTag(userId(req), req.params.name)));
  router.get('/avatars', respond((req) => service.listAvatars(userId(req))));
  router.put('/avatars/:key', respond((req) => service.setAvatar(userId(req), req.params.key, req.body)));
  router.post('/projects', respond((req) => service.createProjectFromPath(userId(req), req.body)));
  router.post('/quick-session', respond((req) => service.ensureQuickSessionProject(userId(req))));

  return router;
}
