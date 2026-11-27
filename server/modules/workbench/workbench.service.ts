import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { AppError } from '@/shared/utils.js';
import { projectsDb } from '@/modules/database/index.js';
import { createProject } from '@/modules/projects/index.js';
import { workbenchDb, type StoredProjectIdentity, type StoredTag } from '@/modules/workbench/workbench.db.js';

/** Palette keys the client knows how to render; mirrored in the frontend workbench module. */
const PALETTE_KEYS = new Set([
  'slate', 'red', 'orange', 'amber', 'lime', 'green', 'teal', 'cyan', 'blue', 'indigo', 'violet', 'pink',
]);

const MAX_BADGE_CHARACTERS = 3;
const MAX_TAG_CHARACTERS = 24;
const MAX_TAGS_PER_SESSION = 8;
const MAX_SETTINGS_BYTES = 16 * 1024;
const DEFAULT_QUICK_SESSION_DIRECTORY = '~/cozycli-quick';
const AVATAR_KEYS = new Set(['claude', 'codex', 'opencode', 'cursor', 'user']);
/** The client downsizes images before upload; this only stops abuse of the table. */
const MAX_AVATAR_DATA_URL_LENGTH = 1024 * 1024;
const AVATAR_DATA_URL_PATTERN = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

/**
 * The quick-session project's name and the CLAUDE.md written once into its
 * folder (so every agent started there files what it saves by date and topic
 * instead of piling it in the root), in the UI language: Chinese for `zh*`,
 * English otherwise.
 */
const QUICK_SESSION_TEXT = {
  en: {
    projectName: 'Quick sessions',
    claudeMd: `# Quick sessions

This folder holds throwaway quick sessions: looking something up or checking something, outside any real project.

- Save files under \`notes/YYYY-MM-DD-<topic>/\`, not in the root.
- For plain Q&A with nothing to keep, write nothing.
- Nothing here is finished work; move anything worth continuing into its own project.
`,
  },
  zh: {
    projectName: '快捷会话',
    claudeMd: `# 快捷会话

这个目录用来放临时的快捷会话：随手查东西、看东西，不属于任何正式项目。

- 需要保存的文件放到 \`notes/YYYY-MM-DD-<主题>/\` 下，不要直接放在根目录。
- 只是问答、不需要产出文件时，什么都不用写。
- 这里的内容不是正式工作成果；要延续的工作请转到对应项目里。
`,
  },
} as const;

const quickSessionText = (language: unknown) =>
  (typeof language === 'string' && language.toLowerCase().startsWith('zh') ? QUICK_SESSION_TEXT.zh : QUICK_SESSION_TEXT.en);

/** Everything the client needs to render the workbench, in one response. */
export type WorkbenchState = {
  settings: Record<string, unknown>;
  projectIdentities: Record<string, StoredProjectIdentity>;
  tags: StoredTag[];
  sessionTags: Record<string, string[]>;
  /** Folder creation time per projectId (ms), used to float new projects in the date sort. */
  projectCreatedAt: Record<string, number>;
  /** When the user last looked at each session (ms); drives the unread dot. */
  sessionViews: Record<string, number>;
};

type WorkbenchDependencies = {
  db: typeof workbenchDb;
  listProjectPaths: () => { project_id: string; project_path: string; isArchived: number }[];
  getProjectByPath: (projectPath: string) => { project_id: string; project_path: string; custom_project_name: string | null; isArchived: number } | null;
  createProject: typeof createProject;
  statBirthtime: (projectPath: string) => Promise<number | null>;
  homedir: () => string;
};

const defaultDependencies: WorkbenchDependencies = {
  db: workbenchDb,
  listProjectPaths: () => projectsDb.getProjectPaths(),
  getProjectByPath: (projectPath) => projectsDb.getProjectPath(projectPath),
  createProject,
  statBirthtime: async (projectPath) => {
    try {
      const stats = await fs.stat(projectPath);
      // birthtime is 0 on filesystems without statx support; ctime is the
      // closest stand-in there.
      return stats.birthtimeMs > 0 ? stats.birthtimeMs : stats.ctimeMs;
    } catch {
      return null;
    }
  },
  homedir: () => os.homedir(),
};

function readColor(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string' && PALETTE_KEYS.has(value)) return value;
  throw new AppError('Unknown color', { code: 'WORKBENCH_INVALID_COLOR', statusCode: 400 });
}

function readBadge(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    throw new AppError('Badge must be a string', { code: 'WORKBENCH_INVALID_BADGE', statusCode: 400 });
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Counted in code points so an emoji or a CJK character is one character.
  if ([...trimmed].length > MAX_BADGE_CHARACTERS) {
    throw new AppError(`Badge must be at most ${MAX_BADGE_CHARACTERS} characters`, {
      code: 'WORKBENCH_INVALID_BADGE',
      statusCode: 400,
    });
  }
  return trimmed;
}

function readTagName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name || [...name].length > MAX_TAG_CHARACTERS) {
    throw new AppError(`Tag names must be 1-${MAX_TAG_CHARACTERS} characters`, {
      code: 'WORKBENCH_INVALID_TAG',
      statusCode: 400,
    });
  }
  return name;
}

function readId(value: unknown, label: string): string {
  const id = typeof value === 'string' ? value.trim() : '';
  if (!id || id.length > 200) {
    throw new AppError(`${label} is required`, { code: 'WORKBENCH_INVALID_ID', statusCode: 400 });
  }
  return id;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Deep-merges a settings patch; a key set to null is removed so its default applies again. */
function mergeSettings(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete merged[key];
    } else if (isPlainObject(value) && isPlainObject(merged[key])) {
      merged[key] = mergeSettings(merged[key] as Record<string, unknown>, value);
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

function expandHome(directory: string, homedir: string): string {
  if (directory === '~') return homedir;
  if (directory.startsWith('~/')) return path.join(homedir, directory.slice(2));
  return directory;
}

/** Creates the workbench workflows; the dependencies are injectable for tests. */
export function createWorkbenchService(dependencies: WorkbenchDependencies = defaultDependencies) {
  const { db } = dependencies;

  return {
    async getState(userId: number): Promise<WorkbenchState> {
      const projectCreatedAt: Record<string, number> = {};
      const projects = dependencies.listProjectPaths().filter((row) => !row.isArchived);
      const birthtimes = await Promise.all(projects.map((row) => dependencies.statBirthtime(row.project_path)));
      projects.forEach((row, index) => {
        const birthtime = birthtimes[index];
        if (birthtime !== null) projectCreatedAt[row.project_id] = Math.round(birthtime);
      });

      // Activity before the first time the unread dot was used counts as read,
      // so switching the feature on does not light up every old session.
      let settings = db.getSettings(userId);
      if (typeof settings.unreadBaseline !== 'number') {
        settings = { ...settings, unreadBaseline: Date.now() };
        db.saveSettings(userId, settings);
      }

      return {
        sessionViews: db.listSessionViews(userId),
        settings,
        projectIdentities: db.listProjectIdentities(userId),
        tags: db.listTags(userId),
        sessionTags: db.listSessionTags(userId),
        projectCreatedAt,
      };
    },

    saveSettings(userId: number, patch: unknown): { settings: Record<string, unknown> } {
      if (!isPlainObject(patch)) {
        throw new AppError('Settings must be an object', { code: 'WORKBENCH_INVALID_SETTINGS', statusCode: 400 });
      }
      const merged = mergeSettings(db.getSettings(userId), patch);
      if (Buffer.byteLength(JSON.stringify(merged)) > MAX_SETTINGS_BYTES) {
        throw new AppError('Settings are too large', { code: 'WORKBENCH_SETTINGS_TOO_LARGE', statusCode: 400 });
      }
      db.saveSettings(userId, merged);
      return { settings: merged };
    },

    setProjectIdentity(userId: number, projectIdInput: unknown, body: unknown): { identity: StoredProjectIdentity } {
      const projectId = readId(projectIdInput, 'projectId');
      const payload = isPlainObject(body) ? body : {};
      const identity = { color: readColor(payload.color), badge: readBadge(payload.badge) };
      db.setProjectIdentity(userId, projectId, identity);
      return { identity };
    },

    setSessionTags(userId: number, sessionIdInput: unknown, body: unknown): { tags: string[] } {
      const sessionId = readId(sessionIdInput, 'sessionId');
      const payload = isPlainObject(body) ? body : {};
      if (!Array.isArray(payload.tags)) {
        throw new AppError('tags must be an array', { code: 'WORKBENCH_INVALID_TAG', statusCode: 400 });
      }
      const tags = [...new Set(payload.tags.map(readTagName))];
      if (tags.length > MAX_TAGS_PER_SESSION) {
        throw new AppError(`At most ${MAX_TAGS_PER_SESSION} tags per session`, {
          code: 'WORKBENCH_TOO_MANY_TAGS',
          statusCode: 400,
        });
      }
      db.setSessionTags(userId, sessionId, tags);
      return { tags };
    },

    updateTag(userId: number, nameInput: unknown, body: unknown): { tag: StoredTag } {
      const name = readTagName(nameInput);
      const payload = isPlainObject(body) ? body : {};
      const color = readColor(payload.color);
      db.upsertTag(userId, name, color);
      return { tag: { name, color } };
    },

    deleteTag(userId: number, nameInput: unknown): { deleted: string } {
      const name = readTagName(nameInput);
      db.deleteTag(userId, name);
      return { deleted: name };
    },

    markSessionViewed(userId: number, sessionIdInput: unknown) {
      const sessionId = readId(sessionIdInput, 'sessionId');
      const viewedAt = Date.now();
      db.markSessionViewed(userId, sessionId, viewedAt);
      return { sessionId, viewedAt };
    },

    listAvatars(userId: number) {
      return { avatars: db.listAvatars(userId) };
    },

    setAvatar(userId: number, keyInput: unknown, body: unknown) {
      const key = typeof keyInput === 'string' ? keyInput : '';
      if (!AVATAR_KEYS.has(key)) {
        throw new AppError('Unknown avatar', { code: 'WORKBENCH_INVALID_AVATAR', statusCode: 400 });
      }
      const payload = isPlainObject(body) ? body : {};
      const dataUrl = payload.dataUrl === null ? null : payload.dataUrl;
      if (dataUrl !== null && (typeof dataUrl !== 'string'
        || dataUrl.length > MAX_AVATAR_DATA_URL_LENGTH
        || !AVATAR_DATA_URL_PATTERN.test(dataUrl))) {
        throw new AppError('Avatar must be a png/jpeg/webp/gif data URL under 1 MB', {
          code: 'WORKBENCH_INVALID_AVATAR',
          statusCode: 400,
        });
      }
      db.setAvatar(userId, key, dataUrl as string | null);
      return { key };
    },

    /**
     * Creates (or reuses) a project for a folder typed in the new-session
     * launcher; `~` expands to the home directory and missing folders are made.
     */
    async createProjectFromPath(_userId: number, body: unknown) {
      const payload = isPlainObject(body) ? body : {};
      const rawPath = typeof payload.path === 'string' ? payload.path.trim() : '';
      if (!rawPath) {
        throw new AppError('path is required', { code: 'WORKBENCH_INVALID_PATH', statusCode: 400 });
      }
      const directory = path.resolve(expandHome(rawPath, dependencies.homedir()));
      const name = typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : null;
      const existing = dependencies.getProjectByPath(directory);
      if (existing && !existing.isArchived) {
        return {
          project: {
            projectId: existing.project_id,
            displayName: existing.custom_project_name || path.basename(directory),
            fullPath: existing.project_path,
            path: existing.project_path,
          },
        };
      }
      await fs.mkdir(directory, { recursive: true });
      const created = await dependencies.createProject({ projectPath: directory, customName: name });
      return { project: created.project };
    },

    /**
     * Makes sure the quick-session folder exists, carries its CLAUDE.md, and is
     * registered as a project, then returns that project. Idempotent.
     */
    async ensureQuickSessionProject(userId: number, language?: unknown) {
      const text = quickSessionText(language);
      const settings = db.getSettings(userId);
      const quick = isPlainObject(settings.quickSession) ? settings.quickSession : {};
      const configured = typeof quick.directory === 'string' && quick.directory.trim()
        ? quick.directory.trim()
        : DEFAULT_QUICK_SESSION_DIRECTORY;
      const directory = path.resolve(expandHome(configured, dependencies.homedir()));

      await fs.mkdir(directory, { recursive: true });
      const claudeMdPath = path.join(directory, 'CLAUDE.md');
      try {
        await fs.writeFile(claudeMdPath, text.claudeMd, { flag: 'wx' });
      } catch (error) {
        // EEXIST: the user may have edited it, so it is never overwritten.
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }

      const existing = dependencies.getProjectByPath(directory);
      if (existing && !existing.isArchived) {
        return {
          project: {
            projectId: existing.project_id,
            displayName: existing.custom_project_name || text.projectName,
            fullPath: existing.project_path,
            path: existing.project_path,
          },
        };
      }

      const created = await dependencies.createProject({ projectPath: directory, customName: text.projectName });
      return { project: created.project };
    },
  };
}

/** The workbench service bound to the real database and filesystem. */
export const workbenchService = createWorkbenchService();
