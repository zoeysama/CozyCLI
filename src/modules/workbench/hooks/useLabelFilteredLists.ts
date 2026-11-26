import { useMemo } from 'react';

import type { Project, RecentConversationListItem, SessionWithProvider, SidebarProjectListProps } from '@/shared/types';
import { useWorkbench } from '@/modules/workbench/context/WorkbenchContext';

/**
 * Used by the sidebar content to apply the workbench filter to its two
 * session lists: the cross-project recents feed and the project tree.
 *
 * With no filter active the inputs are returned untouched (same identities),
 * so the sidebar's memoized rows behave exactly as upstream. Only loaded
 * sessions are considered; a paginated project may hold more matches further
 * down its list.
 */
export function useLabelFilteredLists(
  recentConversations: RecentConversationListItem[],
  projectListProps: SidebarProjectListProps,
): { recentConversations: RecentConversationListItem[]; projectListProps: SidebarProjectListProps } {
  const workbench = useWorkbench();
  const filter = workbench?.filter;
  const sessionTags = workbench?.sessionTags;
  const tagSet = useMemo(() => new Set(filter?.tags ?? []), [filter?.tags]);
  const projectSet = useMemo(() => new Set(filter?.projectIds ?? []), [filter?.projectIds]);
  const isActive = tagSet.size > 0 || projectSet.size > 0;

  const filteredRecents = useMemo(() => {
    if (!isActive) return recentConversations;
    return recentConversations.filter((conversation) => {
      if (projectSet.size > 0 && !(conversation.projectId && projectSet.has(conversation.projectId))) return false;
      if (tagSet.size > 0 && !(sessionTags?.[conversation.sessionId] ?? []).some((tag) => tagSet.has(tag))) return false;
      return true;
    });
  }, [isActive, projectSet, recentConversations, sessionTags, tagSet]);

  const filteredProjectListProps = useMemo(() => {
    if (!isActive) return projectListProps;

    // One cache per filter state: the same source array always maps to the
    // same filtered array, so memoized project rows still bail out.
    const cache = new WeakMap<SessionWithProvider[], SessionWithProvider[]>();
    const getProjectSessions = (project: Project) => {
      const sessions = projectListProps.getProjectSessions(project);
      if (tagSet.size === 0) return sessions;
      let filtered = cache.get(sessions);
      if (!filtered) {
        filtered = sessions.filter((session) => (sessionTags?.[String(session.id)] ?? []).some((tag) => tagSet.has(tag)));
        cache.set(sessions, filtered);
      }
      return filtered;
    };

    const filteredProjects = projectListProps.filteredProjects.filter((project) => {
      if (projectSet.size > 0 && !projectSet.has(project.projectId)) return false;
      if (tagSet.size > 0 && getProjectSessions(project).length === 0) return false;
      return true;
    });

    return { ...projectListProps, filteredProjects, getProjectSessions };
  }, [isActive, projectListProps, projectSet, sessionTags, tagSet]);

  return { recentConversations: filteredRecents, projectListProps: filteredProjectListProps };
}
