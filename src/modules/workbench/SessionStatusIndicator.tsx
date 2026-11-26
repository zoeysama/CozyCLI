import { AlarmClock, Loader2 } from 'lucide-react';

import { Tooltip } from '@/shared/ui';
import { cn } from '@/shared/utils';
import { useWorkbench } from '@/modules/workbench/context/WorkbenchContext';
import { useSessionStatusResolver } from '@/modules/workbench/hooks/useSessionStatusResolver';
import type { SessionStatus } from '@/modules/workbench/utils/sessionStatus';

const LABELS: Record<Exclude<SessionStatus, null>, string> = {
  running: '正在运行',
  alarm: '定了闹钟',
  background: '后台任务运行中',
  unread: '有未读的新内容',
  recent: '10 分钟内有活动',
};

const ALARM_SOURCES: Record<string, string> = {
  wakeup: '会话内的定时唤醒',
  'agent-wake': 'agent-wake 长闹钟',
  'scheduled-message': '定时消息',
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
  if (!resolve) return null;

  const flags = resolve({ sessionId, lastActivity, isProcessing, hasBackgroundWork, isSelected });
  const status: SessionStatus = flags.running ? 'running'
    : flags.alarm ? 'alarm'
      : flags.background ? 'background'
        : flags.unread ? 'unread'
          : flags.recent ? 'recent'
            : null;

  let label = status ? LABELS[status] : '';
  if (status === 'alarm' && flags.alarmAt) {
    label = `${ALARM_SOURCES[flags.alarmSource ?? 'wakeup'] ?? '闹钟'}：${new Date(flags.alarmAt).toLocaleString()}`;
    if (flags.unread) label += '（有未读内容）';
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
