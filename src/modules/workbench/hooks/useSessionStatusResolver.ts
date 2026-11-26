import { useCallback } from 'react';

import { useLiveStatusMap, useSessionActivityMap, useWorkbench } from '@/modules/workbench/context/WorkbenchContext';
import { resolveSessionFlags, toMs, type SessionFlags } from '@/modules/workbench/utils/sessionStatus';

export type SessionStatusQuery = {
  sessionId: string;
  /** The row's own timestamp; the live one from the project list wins when newer. */
  lastActivity: string | number | null | undefined;
  isProcessing: boolean;
  hasBackgroundWork: boolean;
  isSelected: boolean;
};

/**
 * Used by the status slot and the status filter so both read a session the
 * same way: this page's run state, the server's disk-read state (processes
 * other instances own, alarms), and the per-session last-viewed time.
 */
export function useSessionStatusResolver(): ((query: SessionStatusQuery) => SessionFlags & { alarmAt?: number; alarmSource?: string }) | null {
  const workbench = useWorkbench();
  const liveStatus = useLiveStatusMap();
  const activity = useSessionActivityMap();
  const sessionViews = workbench?.sessionViews;
  const unreadBaseline = workbench?.settings.unreadBaseline ?? 0;
  const showRecentDot = workbench?.settings.showRecentDot ?? false;

  const resolve = useCallback((query: SessionStatusQuery) => {
    const live = liveStatus[query.sessionId];
    const flags = resolveSessionFlags({
      isProcessing: query.isProcessing || live?.state === 'running',
      hasBackgroundWork: query.hasBackgroundWork || live?.state === 'background',
      hasAlarm: Boolean(live?.alarmAt),
      isSelected: query.isSelected,
      lastActivity: Math.max(toMs(query.lastActivity), activity?.get(query.sessionId) ?? 0),
      viewedAt: sessionViews?.[query.sessionId] ?? 0,
      unreadBaseline,
      showRecentDot,
      now: Date.now(),
    });
    return { ...flags, alarmAt: live?.alarmAt, alarmSource: live?.alarmSource };
  }, [activity, liveStatus, sessionViews, showRecentDot, unreadBaseline]);

  return workbench ? resolve : null;
}
