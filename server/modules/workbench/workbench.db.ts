import type { Database } from 'better-sqlite3';

import { getConnection } from '@/modules/database/index.js';

/**
 * CozyCLI: storage for the workbench customizations (project identity, session
 * tags, workbench settings).
 *
 * Every table is new and owned by this module: nothing upstream reads or
 * writes them, and nothing here touches an upstream table, so rolling back to
 * an upstream build simply leaves these tables unused. The schema is created
 * lazily on first use instead of through the shared migrations file, which
 * keeps the fork's footprint on upstream files at zero for storage.
 */
const WORKBENCH_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS workbench_settings (
    user_id INTEGER PRIMARY KEY NOT NULL,
    settings_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS workbench_project_identity (
    user_id INTEGER NOT NULL,
    project_id TEXT NOT NULL,
    color TEXT,
    badge TEXT,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, project_id)
);
CREATE TABLE IF NOT EXISTS workbench_tags (
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    color TEXT,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, name)
);
CREATE TABLE IF NOT EXISTS workbench_session_tags (
    user_id INTEGER NOT NULL,
    session_id TEXT NOT NULL,
    tag TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, session_id, tag)
);
CREATE TABLE IF NOT EXISTS workbench_avatars (
    user_id INTEGER NOT NULL,
    avatar_key TEXT NOT NULL,
    data_url TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, avatar_key)
);
CREATE TABLE IF NOT EXISTS workbench_session_views (
    user_id INTEGER NOT NULL,
    session_id TEXT NOT NULL,
    viewed_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, session_id)
);
CREATE INDEX IF NOT EXISTS idx_workbench_session_tags_tag ON workbench_session_tags(user_id, tag);
`;

type ProjectIdentityRow = { project_id: string; color: string | null; badge: string | null };
type TagRow = { name: string; color: string | null };
type SessionTagRow = { session_id: string; tag: string };

/** One project's custom identity; null fields fall back to the generated default on the client. */
export type StoredProjectIdentity = { color: string | null; badge: string | null };

/** A tag definition; `color` is a palette key or null for the neutral chip. */
export type StoredTag = { name: string; color: string | null };

let preparedFor: Database | null = null;

/**
 * Returns the connection with the workbench schema in place. Re-checked per
 * connection so a test that swaps the database file gets the schema as well.
 */
function db(): Database {
  const connection = getConnection();
  if (preparedFor !== connection) {
    connection.exec(WORKBENCH_SCHEMA_SQL);
    preparedFor = connection;
  }
  return connection;
}

/** Used by the workbench service as its only persistence adapter. */
export const workbenchDb = {
  getSettings(userId: number): Record<string, unknown> {
    const row = db()
      .prepare('SELECT settings_json FROM workbench_settings WHERE user_id = ?')
      .get(userId) as { settings_json: string } | undefined;
    if (!row) return {};
    try {
      const parsed = JSON.parse(row.settings_json) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {};
    } catch {
      // A corrupted blob must not take the whole workbench down; defaults apply.
      return {};
    }
  },

  saveSettings(userId: number, settings: Record<string, unknown>): void {
    db()
      .prepare(`
        INSERT INTO workbench_settings (user_id, settings_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET settings_json = excluded.settings_json, updated_at = excluded.updated_at
      `)
      .run(userId, JSON.stringify(settings), Date.now());
  },

  listProjectIdentities(userId: number): Record<string, StoredProjectIdentity> {
    const rows = db()
      .prepare('SELECT project_id, color, badge FROM workbench_project_identity WHERE user_id = ?')
      .all(userId) as ProjectIdentityRow[];
    const result: Record<string, StoredProjectIdentity> = {};
    for (const row of rows) {
      result[row.project_id] = { color: row.color, badge: row.badge };
    }
    return result;
  },

  setProjectIdentity(userId: number, projectId: string, identity: StoredProjectIdentity): void {
    const connection = db();
    if (identity.color === null && identity.badge === null) {
      connection
        .prepare('DELETE FROM workbench_project_identity WHERE user_id = ? AND project_id = ?')
        .run(userId, projectId);
      return;
    }
    connection
      .prepare(`
        INSERT INTO workbench_project_identity (user_id, project_id, color, badge, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id, project_id) DO UPDATE SET
          color = excluded.color, badge = excluded.badge, updated_at = excluded.updated_at
      `)
      .run(userId, projectId, identity.color, identity.badge, Date.now());
  },

  listTags(userId: number): StoredTag[] {
    return db()
      .prepare('SELECT name, color FROM workbench_tags WHERE user_id = ? ORDER BY created_at ASC, rowid ASC')
      .all(userId) as TagRow[];
  },

  upsertTag(userId: number, name: string, color: string | null | undefined): void {
    const connection = db();
    connection
      .prepare('INSERT OR IGNORE INTO workbench_tags (user_id, name, color, created_at) VALUES (?, ?, NULL, ?)')
      .run(userId, name, Date.now());
    if (color !== undefined) {
      connection
        .prepare('UPDATE workbench_tags SET color = ? WHERE user_id = ? AND name = ?')
        .run(color, userId, name);
    }
  },

  deleteTag(userId: number, name: string): void {
    const connection = db();
    connection.transaction(() => {
      connection.prepare('DELETE FROM workbench_session_tags WHERE user_id = ? AND tag = ?').run(userId, name);
      connection.prepare('DELETE FROM workbench_tags WHERE user_id = ? AND name = ?').run(userId, name);
    })();
  },

  listSessionTags(userId: number): Record<string, string[]> {
    const rows = db()
      .prepare('SELECT session_id, tag FROM workbench_session_tags WHERE user_id = ? ORDER BY created_at ASC')
      .all(userId) as SessionTagRow[];
    const result: Record<string, string[]> = {};
    for (const row of rows) {
      (result[row.session_id] ??= []).push(row.tag);
    }
    return result;
  },

  /** Replaces a session's whole tag set in one transaction, creating unseen tags. */
  setSessionTags(userId: number, sessionId: string, tags: string[]): void {
    const connection = db();
    const now = Date.now();
    connection.transaction(() => {
      connection
        .prepare('DELETE FROM workbench_session_tags WHERE user_id = ? AND session_id = ?')
        .run(userId, sessionId);
      const insertTag = connection.prepare(
        'INSERT OR IGNORE INTO workbench_tags (user_id, name, color, created_at) VALUES (?, ?, NULL, ?)',
      );
      const insertLink = connection.prepare(
        'INSERT OR IGNORE INTO workbench_session_tags (user_id, session_id, tag, created_at) VALUES (?, ?, ?, ?)',
      );
      tags.forEach((tag, index) => {
        insertTag.run(userId, tag, now);
        // The offset keeps the chips in the order the user picked them.
        insertLink.run(userId, sessionId, tag, now + index);
      });
    })();
  },

  listSessionViews(userId: number): Record<string, number> {
    const rows = db()
      .prepare('SELECT session_id, viewed_at FROM workbench_session_views WHERE user_id = ?')
      .all(userId) as { session_id: string; viewed_at: number }[];
    return Object.fromEntries(rows.map((row) => [row.session_id, row.viewed_at]));
  },

  /** Only moves forward, so a late request from another device cannot mark newer activity as read. */
  markSessionViewed(userId: number, sessionId: string, viewedAt: number): void {
    db()
      .prepare(`
        INSERT INTO workbench_session_views (user_id, session_id, viewed_at) VALUES (?, ?, ?)
        ON CONFLICT(user_id, session_id) DO UPDATE SET viewed_at = MAX(viewed_at, excluded.viewed_at)
      `)
      .run(userId, sessionId, viewedAt);
  },

  listAvatars(userId: number): Record<string, { dataUrl: string; updatedAt: number }> {
    const rows = db()
      .prepare('SELECT avatar_key, data_url, updated_at FROM workbench_avatars WHERE user_id = ?')
      .all(userId) as { avatar_key: string; data_url: string; updated_at: number }[];
    return Object.fromEntries(rows.map((row) => [row.avatar_key, { dataUrl: row.data_url, updatedAt: row.updated_at }]));
  },

  setAvatar(userId: number, key: string, dataUrl: string | null): void {
    const connection = db();
    if (dataUrl === null) {
      connection.prepare('DELETE FROM workbench_avatars WHERE user_id = ? AND avatar_key = ?').run(userId, key);
      return;
    }
    connection
      .prepare(`
        INSERT INTO workbench_avatars (user_id, avatar_key, data_url, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id, avatar_key) DO UPDATE SET data_url = excluded.data_url, updated_at = excluded.updated_at
      `)
      .run(userId, key, dataUrl, Date.now());
  },
};
