import { useMemo } from 'react';

import type { LLMProvider, RecentConversationListItem } from '@/shared/types';
import { useLiveStatusMap, useWorkbench, useWorkbenchHost, type StatusFilter } from '@/modules/workbench/context/WorkbenchContext';
import { useSessionStatusResolver } from '@/modules/workbench/hooks/useSessionStatusResolver';

type RunState = {
  activeSessions: ReadonlySet<string>;
  backgroundSessionIds: ReadonlySet<string>;
  selectedSessionId: string | null;
};

/**
 * Used by the sidebar's status view (the Running tab): the conversations
 * matching the chosen status tab, flat (no project grouping), plus a count per
 * tab. Sessions that have a status but are not on the loaded Conversations
 * page (e.g. an old session that just got an alarm) are added from the
 * project list so nothing flagged is missed.
 */
export function useStatusView(conversations: RecentConversationListItem[], run: RunState) {
  const workbench = useWorkbench();
  const host = useWorkbenchHost();
  const resolve = useSessionStatusResolver();
  const liveStatus = useLiveStatusMap();
  const filter: StatusFilter = workbench?.statusFilter ?? 'flagged';

  return useMemo(() => {
    if (!resolve) return null;

    // Everything we know about: the loaded conversations, plus flagged sessions elsewhere.
    const items = [...conversations];
    const known = new Set(items.map((item) => item.sessionId));
    const extraIds = new Set([...Object.keys(liveStatus), ...run.activeSessions, ...run.backgroundSessionIds]);
    for (const project of host?.projects ?? []) {
      for (const session of project.sessions ?? []) {
        const id = String(session.id);
        if (known.has(id) || !extraIds.has(id)) continue;
        known.add(id);
        items.push({
          sessionId: id,
          provider: (session.__provider ?? session.provider ?? 'claude') as LLMProvider,
          projectId: project.projectId,
          projectDisplayName: project.displayName,
          sessionTitle: String(session.summary || session.name || session.title || id),
          lastActivity: String(session.lastActivity ?? session.updated_at ?? session.created_at ?? ''),
        } as RecentConversationListItem);
      }
    }

    const flagged = items.map((item) => ({
      item,
      flags: resolve({
        sessionId: item.sessionId,
        lastActivity: item.lastActivity,
        isProcessing: run.activeSessions.has(item.sessionId) && !run.backgroundSessionIds.has(item.sessionId),
        hasBackgroundWork: run.backgroundSessionIds.has(item.sessionId),
        isSelected: item.sessionId === run.selectedSessionId,
      }),
    }));

    const matches: Record<StatusFilter, (flags: (typeof flagged)[number]['flags']) => boolean> = {
      active: (flags) => flags.running || flags.background || flags.alarm,
      unread: (flags) => flags.unread,
      flagged: (flags) => flags.running || flags.background || flags.alarm || flags.unread,
      all: () => true,
    };
    const counts = Object.fromEntries(
      (Object.keys(matches) as StatusFilter[]).map((key) => [key, flagged.filter(({ flags }) => matches[key](flags)).length]),
    ) as Record<StatusFilter, number>;

    const list = flagged
      .filter(({ flags }) => matches[filter](flags))
      .map(({ item }) => item)
      .sort((a, b) => Date.parse(b.lastActivity ?? '') - Date.parse(a.lastActivity ?? ''));

    return { filter, list, counts };
  }, [conversations, filter, host?.projects, liveStatus, resolve, run.activeSessions, run.backgroundSessionIds, run.selectedSessionId]);
}
