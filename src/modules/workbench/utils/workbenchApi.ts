import { authenticatedFetch, readApiJson } from '@/shared/api';
import type { Project } from '@/shared/types';

/**
 * CozyCLI: endpoint helpers for the fork-only `/api/workbench` routes.
 *
 * Kept inside the workbench module rather than in src/shared/api.ts on
 * purpose: the fork rebases onto upstream releases, and every line it adds to
 * a busy shared file is a future merge conflict.
 */

/** A session's live state and earliest pending alarm, read by the server from disk. */
export type LiveSessionStatus = {
  state?: 'running' | 'background';
  alarmAt?: number;
  alarmSource?: 'wakeup' | 'agent-wake' | 'scheduled-message';
};

/** Server shape of the workbench state; see server/modules/workbench. */
export type WorkbenchStatePayload = {
  settings: Record<string, unknown>;
  projectIdentities: Record<string, { color: string | null; badge: string | null }>;
  tags: { name: string; color: string | null }[];
  sessionTags: Record<string, string[]>;
  projectCreatedAt: Record<string, number>;
  sessionViews: Record<string, number>;
};

const json = (method: string, body?: unknown) => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

const encode = encodeURIComponent;

export const workbenchApi = {
  getState: async (): Promise<WorkbenchStatePayload> =>
    readApiJson<WorkbenchStatePayload>(await authenticatedFetch('/api/workbench/state')),

  saveSettings: async (patch: Record<string, unknown>) =>
    readApiJson<{ settings: Record<string, unknown> }>(
      await authenticatedFetch('/api/workbench/settings', json('PATCH', patch)),
    ),

  setProjectIdentity: async (projectId: string, identity: { color: string | null; badge: string | null }) =>
    readApiJson(await authenticatedFetch(`/api/workbench/projects/${encode(projectId)}/identity`, json('PUT', identity))),

  setSessionTags: async (sessionId: string, tags: string[]) =>
    readApiJson(await authenticatedFetch(`/api/workbench/sessions/${encode(sessionId)}/tags`, json('PUT', { tags }))),

  getSessionStatus: async () =>
    readApiJson<{ sessions: Record<string, LiveSessionStatus> }>(await authenticatedFetch('/api/workbench/session-status')),

  markSessionViewed: async (sessionId: string) =>
    readApiJson(await authenticatedFetch(`/api/workbench/sessions/${encode(sessionId)}/viewed`, json('PUT', {}))),

  updateTag: async (name: string, color: string | null) =>
    readApiJson(await authenticatedFetch(`/api/workbench/tags/${encode(name)}`, json('PUT', { color }))),

  deleteTag: async (name: string) =>
    readApiJson(await authenticatedFetch(`/api/workbench/tags/${encode(name)}`, json('DELETE'))),

  createProject: async (projectPath: string, name: string | null) =>
    readApiJson<{ project: Pick<Project, 'projectId' | 'displayName' | 'fullPath' | 'path'> }>(
      await authenticatedFetch('/api/workbench/projects', json('POST', { path: projectPath, name })),
    ),

  ensureQuickSessionProject: async () =>
    readApiJson<{ project: Pick<Project, 'projectId' | 'displayName' | 'fullPath' | 'path'> }>(
      await authenticatedFetch('/api/workbench/quick-session', json('POST', {})),
    ),

  listAvatars: async () =>
    readApiJson<{ avatars: Record<string, { dataUrl: string; updatedAt: number }> }>(
      await authenticatedFetch('/api/workbench/avatars'),
    ),

  setAvatar: async (key: string, dataUrl: string | null) =>
    readApiJson(await authenticatedFetch(`/api/workbench/avatars/${encode(key)}`, json('PUT', { dataUrl }))),

  /** Plugin RPC passthrough, used by the usage meter to read the usage plugins. */
  pluginRpc: async (pluginName: string, route: string): Promise<unknown> => {
    const response = await authenticatedFetch(
      `/api/plugins/${encode(pluginName)}/rpc/${route.split('/').map(encode).join('/')}`,
      { headers: { Accept: 'application/json' } },
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  },
};
