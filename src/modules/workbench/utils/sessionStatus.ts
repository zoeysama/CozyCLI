/** Upstream's "recently active" window. */
const RECENT_WINDOW_MS = 10 * 60 * 1000;

/** What the status slot shows, highest priority first. */
export type SessionStatus = 'running' | 'alarm' | 'background' | 'unread' | 'recent' | null;

/** Every state a session can be in at once; the slot shows the top one, the status filter uses all of them. */
export type SessionFlags = {
  running: boolean;
  background: boolean;
  alarm: boolean;
  unread: boolean;
  recent: boolean;
};

export type SessionStatusInput = {
  isProcessing: boolean;
  hasBackgroundWork: boolean;
  hasAlarm?: boolean;
  isSelected: boolean;
  lastActivity: number;
  viewedAt: number;
  unreadBaseline: number;
  showRecentDot: boolean;
  now: number;
};

export function toMs(value: string | number | null | undefined): number {
  if (typeof value === 'number') return value;
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function resolveSessionFlags(input: SessionStatusInput): SessionFlags {
  return {
    running: input.isProcessing,
    background: !input.isProcessing && input.hasBackgroundWork,
    alarm: Boolean(input.hasAlarm),
    unread: !input.isSelected && input.lastActivity > Math.max(input.viewedAt, input.unreadBaseline),
    recent: input.showRecentDot && input.now - input.lastActivity < RECENT_WINDOW_MS,
  };
}

/**
 * The single status of a row. An alarm outranks plain background work: a
 * session waiting for its wakeup is idle in the background, and the alarm is
 * the more specific thing to say.
 */
export function resolveSessionStatus(input: SessionStatusInput): SessionStatus {
  const flags = resolveSessionFlags(input);
  if (flags.running) return 'running';
  if (flags.alarm) return 'alarm';
  if (flags.background) return 'background';
  if (flags.unread) return 'unread';
  if (flags.recent) return 'recent';
  return null;
}
