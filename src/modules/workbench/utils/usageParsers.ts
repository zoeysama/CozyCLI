/**
 * CozyCLI: response parsers for the Claude Usage and Codex Usage plugins, ported
 * from the "CloudCLI · Claude + Codex Usage Sidebar" userscript (v1.5.0) this
 * module replaces. They search the payload breadth-first because the plugin
 * RPC proxy may wrap the data in `data`/`result` envelopes.
 */

/** Used percentages (0-100) of the 5-hour and 7-day windows, with reset times in ms. */
export type UsageWindows = {
  h5: number | null;
  d7: number | null;
  h5ResetAt: number | null;
  d7ResetAt: number | null;
};

type AnyRecord = Record<string, unknown>;

function percent(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace('%', '')) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

function pick(record: AnyRecord | null | undefined, ...keys: string[]): unknown {
  if (!record) return null;
  for (const key of keys) if (record[key] != null) return record[key];
  return null;
}

function objectsDeep(value: unknown, maxDepth = 6): AnyRecord[] {
  const result: AnyRecord[] = [];
  const seen = new Set<unknown>();
  const queue: [unknown, number][] = [[value, 0]];
  while (queue.length) {
    const [item, depth] = queue.shift()!;
    if (!item || typeof item !== 'object' || seen.has(item)) continue;
    seen.add(item);
    result.push(item as AnyRecord);
    if (depth >= maxDepth) continue;
    for (const [key, child] of Object.entries(item as AnyRecord)) {
      // Never walk into anything that looks like a credential.
      if (/token|credential|auth|secret/i.test(key)) continue;
      if (child && typeof child === 'object') queue.push([child, depth + 1]);
    }
  }
  return result;
}

function windowMinutes(record: AnyRecord | null): number | null {
  const minutes = Number(pick(record, 'windowDurationMins', 'window_duration_mins', 'window_minutes', 'durationMinutes'));
  if (Number.isFinite(minutes) && minutes > 0) return minutes;
  const seconds = Number(pick(record, 'limit_window_seconds', 'windowDurationSeconds', 'window_duration_seconds', 'window_seconds'));
  return Number.isFinite(seconds) && seconds > 0 ? seconds / 60 : null;
}

function usagePercent(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value !== 'object') return percent(value);
  return percent(pick(value as AnyRecord, 'usedPercent', 'used_percent', 'utilization', 'percentage',
    'percentUsed', 'percent_used', 'percent', 'usagePercent', 'usage_percent'));
}

function resetAt(record: AnyRecord | null): number | null {
  const value = pick(record, 'resetsAt', 'resets_at', 'resetAt', 'reset_at');
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n < 1e12 ? n * 1000 : n;
}

const empty = (): UsageWindows => ({ h5: null, d7: null, h5ResetAt: null, d7ResetAt: null });
const hasAny = (windows: UsageWindows) => windows.h5 !== null || windows.d7 !== null;

/** Codex app-server's primary/secondary window shape (camelCase or snake_case). */
function parsePrimarySecondary(payload: unknown): UsageWindows | null {
  for (const candidate of objectsDeep(payload)) {
    const windows = empty();
    const entries = [
      pick(candidate, 'primary', 'primaryWindow', 'primary_window', 'fiveHour', 'five_hour', 'h5') as AnyRecord | null,
      pick(candidate, 'secondary', 'secondaryWindow', 'secondary_window', 'weekly', 'sevenDay', 'seven_day', 'd7') as AnyRecord | null,
    ];
    if (entries.every((entry) => entry == null)) continue;
    for (const entry of entries) {
      if (!entry) continue;
      const minutes = windowMinutes(entry);
      const value = usagePercent(entry);
      if (value == null) continue;
      if (minutes != null && Math.abs(minutes - 300) < 1) { windows.h5 = value; windows.h5ResetAt = resetAt(entry); }
      else if (minutes != null && Math.abs(minutes - 10080) < 1) { windows.d7 = value; windows.d7ResetAt = resetAt(entry); }
    }
    // Without window lengths, primary/secondary are conventionally 5h/7d.
    if (!hasAny(windows)) {
      windows.h5 = usagePercent(entries[0]);
      windows.d7 = usagePercent(entries[1]);
    } else {
      if (windows.h5 === null && windowMinutes(entries[0]) == null) windows.h5 = usagePercent(entries[0]);
      if (windows.d7 === null && windowMinutes(entries[1]) == null) windows.d7 = usagePercent(entries[1]);
    }
    if (hasAny(windows)) return windows;
  }
  return null;
}

/** Claude Usage plugin: `{ limits: [{ kind, label, percent, resetsAt }] }`, with older fallbacks. */
export function parseClaudeUsage(payload: unknown): UsageWindows | null {
  for (const candidate of objectsDeep(payload)) {
    if (Array.isArray(candidate.limits)) {
      const windows = empty();
      for (const limit of candidate.limits as AnyRecord[]) {
        const kind = String(limit?.kind || '').toLowerCase();
        const label = String(limit?.label || '').toLowerCase();
        const value = usagePercent(limit);
        if (value === null) continue;
        if (kind === 'session' || /session.*5h/.test(label)) { windows.h5 = value; windows.h5ResetAt = resetAt(limit); }
        if (kind === 'weekly_all' || /weekly.*all models/.test(label)) { windows.d7 = value; windows.d7ResetAt = resetAt(limit); }
      }
      if (hasAny(windows)) return windows;
    }
    const h5 = usagePercent(pick(candidate, 'five_hour', 'fiveHour', 'fiveHourUsage', 'session', 'session_5h'));
    const d7 = usagePercent(pick(candidate, 'seven_day', 'sevenDay', 'weekly', 'week', 'weekly_all_models'));
    if (h5 !== null || d7 !== null) return { ...empty(), h5, d7 };
  }
  return null;
}

/** Codex Usage plugin: `limits[].windows[]`, the primary/secondary shape, or flat fields. */
export function parseCodexUsage(payload: unknown): UsageWindows | null {
  const primarySecondary = parsePrimarySecondary(payload);
  if (primarySecondary) return primarySecondary;
  for (const candidate of objectsDeep(payload)) {
    if (Array.isArray(candidate.limits)) {
      const windows = empty();
      for (const limit of candidate.limits as AnyRecord[]) {
        const rateWindows = Array.isArray(limit?.windows) ? limit.windows as AnyRecord[] : [limit];
        for (const window of rateWindows) {
          const minutes = windowMinutes(window);
          const value = usagePercent(window);
          if (value == null) continue;
          const label = String(window?.label || window?.kind || limit?.name || limit?.id || '').toLowerCase();
          if (minutes === 300 || /5h|5.hour/.test(label)) { windows.h5 = value; windows.h5ResetAt = resetAt(window); }
          if (minutes === 10080 || /1w|7d|weekly/.test(label)) { windows.d7 = value; windows.d7ResetAt = resetAt(window); }
        }
      }
      if (hasAny(windows)) return windows;
    }
    const h5 = usagePercent(pick(candidate, 'fiveHour', 'five_hour', 'h5'));
    const d7 = usagePercent(pick(candidate, 'weekly', 'sevenDay', 'seven_day', 'd7'));
    if (h5 !== null || d7 !== null) return { ...empty(), h5, d7 };
  }
  return null;
}

/** "3时-12分" for the 5h window, "2天-5时" for the 7d window, as the userscript showed them. */
export function formatReset(timestamp: number | null, window: 'h5' | 'd7', now = Date.now()): string {
  if (timestamp === null || !Number.isFinite(timestamp)) return '';
  const minutes = Math.max(0, Math.ceil((timestamp - now) / 60000));
  if (window === 'h5') return `${Math.floor(minutes / 60)}时-${minutes % 60}分`;
  const hours = Math.ceil(minutes / 60);
  return `${Math.floor(hours / 24)}天-${hours % 24}时`;
}

/**
 * The plugin-neutral usage contract, for new usage plugins (Gemini, …).
 * A plugin RPC route may return either
 *   { "h5": 12, "d7": 40, "h5ResetAt": "2026-11-26T16:00:00Z", "d7ResetAt": 1795800000 }
 * or
 *   { "windows": [ { "window": "5h", "usedPercent": 12, "resetsAt": "…" },
 *                  { "window": "7d", "usedPercent": 40, "resetsAt": "…" } ] }
 * Percentages are 0-100 "used"; reset times are ISO strings or epoch s/ms.
 * Envelopes such as { data: … } are searched through.
 */
export function parseStandardUsage(payload: unknown): UsageWindows | null {
  for (const candidate of objectsDeep(payload)) {
    const flat: UsageWindows = {
      h5: usagePercent(candidate.h5),
      d7: usagePercent(candidate.d7),
      h5ResetAt: resetAt({ resetsAt: candidate.h5ResetAt }),
      d7ResetAt: resetAt({ resetsAt: candidate.d7ResetAt }),
    };
    if (hasAny(flat)) return flat;

    if (Array.isArray(candidate.windows)) {
      const windows = empty();
      for (const window of candidate.windows as AnyRecord[]) {
        const name = String(window?.window ?? window?.id ?? window?.label ?? '').toLowerCase();
        const minutes = windowMinutes(window);
        const value = usagePercent(window);
        if (value === null) continue;
        if (name === '5h' || minutes === 300) { windows.h5 = value; windows.h5ResetAt = resetAt(window); }
        if (name === '7d' || name === '1w' || minutes === 10080) { windows.d7 = value; windows.d7ResetAt = resetAt(window); }
      }
      if (hasAny(windows)) return windows;
    }
  }
  return null;
}

/** Which parser a usage source uses; `auto` tries the standard contract, then the two known plugins. */
export type UsageParserId = 'auto' | 'standard' | 'claude' | 'codex';

export function parseUsage(parser: UsageParserId, payload: unknown): UsageWindows | null {
  if (parser === 'claude') return parseClaudeUsage(payload);
  if (parser === 'codex') return parseCodexUsage(payload);
  if (parser === 'standard') return parseStandardUsage(payload);
  return parseStandardUsage(payload) ?? parseClaudeUsage(payload) ?? parseCodexUsage(payload);
}
