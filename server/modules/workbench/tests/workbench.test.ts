import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { closeConnection, initializeDatabase } from '@/modules/database/index.js';
import { workbenchDb } from '@/modules/workbench/workbench.db.js';
import { createWorkbenchService } from '@/modules/workbench/workbench.service.js';

async function withDatabase(run: () => Promise<void> | void): Promise<void> {
  const previous = process.env.DATABASE_PATH;
  const directory = await mkdtemp(path.join(tmpdir(), 'workbench-db-'));
  closeConnection();
  process.env.DATABASE_PATH = path.join(directory, 'auth.db');
  try {
    await initializeDatabase();
    await run();
  } finally {
    closeConnection();
    if (previous === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = previous;
    await rm(directory, { recursive: true, force: true });
  }
}

type ServiceDependencies = NonNullable<Parameters<typeof createWorkbenchService>[0]>;

function createService(overrides: Partial<ServiceDependencies> = {}) {
  return createWorkbenchService({
    db: workbenchDb,
    listProjectPaths: () => [],
    getProjectByPath: () => null,
    createProject: async () => { throw new Error('not expected'); },
    statBirthtime: async () => null,
    homedir: () => '/home/nobody',
    ...overrides,
  });
}

test('session tags keep the chosen order, are user scoped and are removed with their tag', async () => {
  await withDatabase(() => {
    const service = createService();
    service.setSessionTags(1, 'session-a', { tags: ['paper', 'infra', 'paper'] });
    service.setSessionTags(2, 'session-a', { tags: ['other-user'] });
    service.updateTag(1, 'infra', { color: 'teal' });

    assert.deepEqual(workbenchDb.listSessionTags(1), { 'session-a': ['paper', 'infra'] });
    assert.deepEqual(workbenchDb.listTags(1).map((tag) => [tag.name, tag.color]), [['paper', null], ['infra', 'teal']]);

    service.deleteTag(1, 'paper');
    assert.deepEqual(workbenchDb.listSessionTags(1), { 'session-a': ['infra'] });
    assert.deepEqual(workbenchDb.listSessionTags(2), { 'session-a': ['other-user'] });
  });
});

test('project identity validates input and clearing both fields deletes the row', async () => {
  await withDatabase(() => {
    const service = createService();
    service.setProjectIdentity(1, 'project-1', { color: 'violet', badge: ' 数学 ' });
    assert.deepEqual(workbenchDb.listProjectIdentities(1), { 'project-1': { color: 'violet', badge: '数学' } });

    assert.throws(() => service.setProjectIdentity(1, 'project-1', { color: '#123456' }), /Unknown color/);
    assert.throws(() => service.setProjectIdentity(1, 'project-1', { badge: 'ABCD' }), /at most 3/);

    service.setProjectIdentity(1, 'project-1', { color: null, badge: '' });
    assert.deepEqual(workbenchDb.listProjectIdentities(1), {});
  });
});

test('settings are deep merged and null removes a key', async () => {
  await withDatabase(() => {
    const service = createService();
    service.saveSettings(1, { cleanup: { hideGithubStar: true }, activityBar: { enabled: true } });
    service.saveSettings(1, { cleanup: { hideCommunity: true }, activityBar: null });
    assert.deepEqual(workbenchDb.getSettings(1), { cleanup: { hideGithubStar: true, hideCommunity: true } });
    assert.throws(() => service.saveSettings(1, ['not', 'an', 'object']), /must be an object/);
  });
});

test('state reports folder creation times for active projects only', async () => {
  await withDatabase(async () => {
    const service = createService({
      listProjectPaths: () => [
        { project_id: 'p1', project_path: '/a', isArchived: 0 },
        { project_id: 'p2', project_path: '/b', isArchived: 1 },
        { project_id: 'p3', project_path: '/missing', isArchived: 0 },
      ],
      statBirthtime: async (projectPath) => (projectPath === '/a' ? 1234.6 : projectPath === '/b' ? 99 : null),
    });
    const state = await service.getState(1);
    assert.deepEqual(state.projectCreatedAt, { p1: 1235 });
  });
});

test('quick session project is created once and never overwrites an edited CLAUDE.md', async () => {
  await withDatabase(async () => {
    const home = await mkdtemp(path.join(tmpdir(), 'workbench-home-'));
    try {
      const created: string[] = [];
      let registered: { project_id: string; project_path: string; custom_project_name: string | null; isArchived: number } | null = null;
      const service = createService({
        homedir: () => home,
        getProjectByPath: () => registered,
        createProject: async (input) => {
          created.push(input.projectPath);
          registered = { project_id: 'quick-1', project_path: input.projectPath, custom_project_name: input.customName ?? null, isArchived: 0 };
          return {
            outcome: 'created',
            project: { projectId: 'quick-1', displayName: '快捷会话', fullPath: input.projectPath, path: input.projectPath },
          } as Awaited<ReturnType<ServiceDependencies['createProject']>>;
        },
      });

      const first = await service.ensureQuickSessionProject(1);
      const quickDirectory = path.join(home, 'cozycli-quick');
      assert.equal(first.project.projectId, 'quick-1');
      assert.deepEqual(created, [quickDirectory]);
      assert.match(await readFile(path.join(quickDirectory, 'CLAUDE.md'), 'utf8'), /notes\/YYYY-MM-DD/);

      await writeFile(path.join(quickDirectory, 'CLAUDE.md'), 'edited by user');
      const second = await service.ensureQuickSessionProject(1);
      assert.equal(second.project.projectId, 'quick-1');
      assert.deepEqual(created, [quickDirectory], 'an existing project is reused');
      assert.equal(await readFile(path.join(quickDirectory, 'CLAUDE.md'), 'utf8'), 'edited by user');
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});

test('avatars accept only image data URLs for known keys', async () => {
  await withDatabase(() => {
    const service = createService();
    service.setAvatar(1, 'claude', { dataUrl: 'data:image/png;base64,iVBORw0KGgo=' });
    assert.equal(service.listAvatars(1).avatars.claude?.dataUrl, 'data:image/png;base64,iVBORw0KGgo=');
    assert.throws(() => service.setAvatar(1, 'gemini', { dataUrl: 'data:image/png;base64,AA==' }), /Unknown avatar/);
    assert.throws(() => service.setAvatar(1, 'user', { dataUrl: 'javascript:alert(1)' }), /data URL/);
    service.setAvatar(1, 'claude', { dataUrl: null });
    assert.deepEqual(service.listAvatars(1).avatars, {});
  });
});

test('session views only move forward and the unread baseline is set once', async () => {
  await withDatabase(async () => {
    const service = createService();
    workbenchDb.markSessionViewed(1, 's1', 2000);
    workbenchDb.markSessionViewed(1, 's1', 1000);
    assert.equal(workbenchDb.listSessionViews(1).s1, 2000);
    const first = await service.getState(1);
    const second = await service.getState(1);
    assert.equal(typeof first.settings.unreadBaseline, 'number');
    assert.equal(second.settings.unreadBaseline, first.settings.unreadBaseline);
    assert.equal(first.sessionViews.s1, 2000);
  });
});

test('the latest ScheduleWakeup decides the alarm, and stop clears it', async () => {
  const { latestWakeupAt } = await import('@/modules/workbench/session-status.service.js');
  const line = (timestamp: string, input: Record<string, unknown>) => JSON.stringify({
    timestamp,
    message: { content: [{ type: 'tool_use', name: 'ScheduleWakeup', input }] },
  });
  const tail = ['{"cut', line('2026-11-26T10:00:00Z', { delaySeconds: 600 }), line('2026-11-26T10:05:00Z', { delaySeconds: 1200 })].join('\n');
  assert.equal(latestWakeupAt(tail), Date.parse('2026-11-26T10:25:00Z'));
  assert.equal(latestWakeupAt(tail + '\n' + line('2026-11-26T10:06:00Z', { stop: true })), null);
  assert.equal(latestWakeupAt('nothing here'), null);
});
