import assert from 'node:assert/strict';

import { test } from 'vitest';

import type { Project } from '@/shared/types';
import { sortProjects } from '@/modules/sidebar/utils/sidebarProjectFormatting';

// CozyCLI: covers the optional folder-creation-time argument added to sortProjects.
test('the date sort counts folder creation time, so a new empty project leads', () => {
  const project = (projectId: string, lastActivity?: string): Project => ({
    projectId,
    displayName: projectId,
    fullPath: `/w/${projectId}`,
    sessions: lastActivity ? [{ id: `${projectId}-s`, lastActivity }] : [],
  });
  const projects = [project('old', '2026-11-20T10:00:00Z'), project('fresh'), project('busy', '2026-11-25T10:00:00Z')];
  const createdAt: Record<string, number> = { fresh: Date.parse('2026-11-26T09:00:00Z') };

  assert.deepEqual(sortProjects(projects, 'date').map((p) => p.projectId), ['busy', 'old', 'fresh']);
  assert.deepEqual(
    sortProjects(projects, 'date', (p) => createdAt[p.projectId] ?? 0).map((p) => p.projectId),
    ['fresh', 'busy', 'old'],
  );
});
