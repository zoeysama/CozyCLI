import type { UsageParserId } from '@/modules/workbench/utils/usageParsers';

/**
 * CozyCLI: one row of the usage meter — which plugin RPC route to read and how.
 *
 * Built-in sources cover the installed Claude Usage and Codex Usage plugins.
 * Anything else (a Gemini usage plugin, …) is added as a custom source in the
 * workbench settings; it needs no code as long as its route returns the
 * standard contract documented on parseStandardUsage (or one of the two
 * known plugin shapes).
 */
export type UsageSource = {
  /** Stable id; built-ins use the provider name so the provider logo is shown. */
  id: string;
  label: string;
  /** Plugin `name` from its manifest. */
  plugin: string;
  /** RPC path under /api/plugins/<plugin>/rpc/. */
  route: string;
  /** CSS color of the label and bar. */
  color: string;
  parser: UsageParserId;
};

export const BUILTIN_USAGE_SOURCES: UsageSource[] = [
  { id: 'claude', label: 'Claude', plugin: 'claude-usage', route: 'live', color: '#d97757', parser: 'claude' },
  { id: 'codex', label: 'Codex', plugin: 'codex-usage', route: 'rate-limits', color: '#10a37f', parser: 'codex' },
];

const PARSERS: UsageParserId[] = ['auto', 'standard', 'claude', 'codex'];

/** Drops malformed custom entries from stored settings. */
export function readCustomUsageSources(value: unknown): UsageSource[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): UsageSource[] => {
    if (!entry || typeof entry !== 'object') return [];
    const record = entry as Record<string, unknown>;
    const text = (key: string) => (typeof record[key] === 'string' ? (record[key] as string).trim() : '');
    const source: UsageSource = {
      id: text('id'),
      label: text('label'),
      plugin: text('plugin'),
      route: text('route').replace(/^\/+/, ''),
      color: /^#[0-9a-f]{6}$/i.test(text('color')) ? text('color') : '#6366f1',
      parser: PARSERS.includes(record.parser as UsageParserId) ? record.parser as UsageParserId : 'auto',
    };
    return source.id && source.label && source.plugin && source.route ? [source] : [];
  });
}
