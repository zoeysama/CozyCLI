import { AlarmClock, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Tooltip } from '@/shared/ui';
import { cn } from '@/shared/utils';
import { useWorkbench } from '@/modules/workbench/context/WorkbenchContext';
import { useSessionStatusResolver } from '@/modules/workbench/hooks/useSessionStatusResolver';
import type { SessionStatus } from '@/modules/workbench/utils/sessionStatus';

// Translation keys (workbench namespace); resolved at render so a language switch applies at once.
const LABELS: Record<Exclude<SessionStatus, null>, string> = {
  running: 'status.running',
  alarm: 'status.alarm',
  background: 'status.background',
  unread: 'status.unread',
  recent: 'status.recent',
};

const ALARM_SOURCES: Record<string, string> = {
  wakeup: 'status.alarmSources.wakeup',
  'agent-wake': 'status.alarmSources.agentWake',
  'scheduled-message': 'status.alarmSources.scheduledMessage',
};

/**
 * Used by the sidebar session rows (project tree and Conversations/Pinned
 * lists) in place of upstream's edge dots and right-hand spinner: one fixed
 * slot after the project stripe showing the session's top status — running
 * (blue spinner), alarm (clock; amber when there is also unread content),
 * background work (purple spinner), unread (amber dot) or, optionally, recent
 * (green dot). The slot keeps its width when empty so rows stay aligned.
 */
export default function SessionStatusIndicator({ sessionId, lastActivity, isProcessing, hasBackgroundWork, isSelected, className }: {
  sessionId: string;
  lastActivity: string | number | null | undefined;
  isProcessing: boolean;
  hasBackgroundWork: boolean;
  isSelected: boolean;
  className?: string;
}) {
  const resolve = useSessionStatusResolver();
  const { t } = useTranslation('workbench');
  if (!resolve) return null;

  const flags = resolve({ sessionId, lastActivity, isProcessing, hasBackgroundWork, isSelected });
  const status: SessionStatus = flags.running ? 'running'
    : flags.alarm ? 'alarm'
      : flags.background ? 'background'
        : flags.unread ? 'unread'
          : flags.recent ? 'recent'
            : null;

  let label = status ? t(LABELS[status]) : '';
  if (status === 'alarm' && flags.alarmAt) {
    const sourceKey = ALARM_SOURCES[flags.alarmSource ?? 'wakeup'];
    label = t('status.alarmAt', { source: sourceKey ? t(sourceKey) : t('status.alarmFallback'), time: new Date(flags.alarmAt).toLocaleString() });
    if (flags.unread) label += t('status.alarmUnread');
  }

  return (
    <span className={cn('flex h-3 w-3 flex-shrink-0 items-center justify-center', className)}>
      {status && (
        <Tooltip content={label} position="right">
          <span role="status" aria-label={label} className="flex items-center justify-center">
            {status === 'running' && <Loader2 className="h-3 w-3 animate-spin text-sky-500" />}
            {status === 'alarm' && (
              <AlarmClock className={cn('h-3 w-3', flags.unread ? 'text-amber-500' : 'text-sky-500 dark:text-sky-400')} />
            )}
            {status === 'background' && <Loader2 className="h-3 w-3 animate-spin text-purple-500 dark:text-purple-400" />}
            {status === 'unread' && <span className="h-2 w-2 rounded-full bg-amber-500" />}
            {status === 'recent' && <span className="h-1.5 w-1.5 rounded-full bg-green-500" />}
          </span>
        </Tooltip>
      )}
    </span>
  );
}

/** Used by the patched sidebar rows to know whether the slot replaces upstream's indicators. */
export function useStatusSlotEnabled(): boolean {
  return Boolean(useWorkbench());
}
