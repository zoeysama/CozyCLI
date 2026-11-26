import { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCw } from 'lucide-react';

import { LLMProviderLogo } from '@/shared/ui';
import { cn } from '@/shared/utils';
import { usePlugins } from '@/modules/plugins';
import { useWorkbench } from '@/modules/workbench/context/WorkbenchContext';
import { workbenchApi } from '@/modules/workbench/utils/workbenchApi';
import { formatReset, parseUsage, type UsageWindows } from '@/modules/workbench/utils/usageParsers';
import { BUILTIN_USAGE_SOURCES, type UsageSource } from '@/modules/workbench/utils/usageSources';
import type { LLMProvider } from '@/shared/types';

type MeterSource = UsageSource;

const PROVIDER_LOGOS = new Set(['claude', 'codex', 'cursor', 'opencode']);

/** The provider logo for built-ins, a colored letter for anything else (e.g. Gemini). */
function SourceIcon({ source }: { source: MeterSource }) {
  if (PROVIDER_LOGOS.has(source.id)) {
    return <LLMProviderLogo provider={source.id as LLMProvider} className="h-[15px] w-[15px] flex-none" />;
  }
  return (
    <span
      className="flex h-[15px] w-[15px] flex-none items-center justify-center rounded-full text-[9px] font-bold text-white"
      style={{ background: source.color }}
    >
      {source.label.slice(0, 1).toUpperCase()}
    </span>
  );
}

type MeterState = UsageWindows & { updated: number; error: string };

/** Last values shown, so the first paint has numbers while the refresh is in flight. Display only. */
const CACHE_KEY = 'workbench-usage-meter';

function readCache(): Partial<Record<string, MeterState>> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') as Partial<Record<string, MeterState>>;
  } catch {
    return {};
  }
}

function formatPercent(value: number | null): string {
  return value === null ? '—' : `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

function Metric({ value, resetAt, window, color, stale, title }: {
  value: number | null;
  resetAt: number | null;
  window: 'h5' | 'd7';
  color: string;
  stale: boolean;
  title: string;
}) {
  return (
    <span className={cn('flex min-w-0 flex-col gap-[3px]', stale && 'opacity-55')} title={title}>
      <span className="text-right text-[11px] font-semibold tabular-nums text-foreground">{formatPercent(value)}</span>
      <span className="block h-[3px] w-full overflow-hidden rounded-full bg-muted-foreground/20">
        <span
          className="block h-full rounded-full transition-[width] duration-300"
          style={{ width: `${value === null ? 0 : Math.max(0, Math.min(100, value))}%`, background: color }}
        />
      </span>
      <span className="whitespace-nowrap text-right text-[8px] tabular-nums leading-none text-muted-foreground">
        {formatReset(resetAt, window)}
      </span>
    </span>
  );
}

/**
 * Used by the sidebar footer: 5-hour and 7-day usage for Claude and Codex,
 * read from the usage plugins. Replaces the Usage Sidebar userscript; a
 * source whose plugin is missing or disabled is simply not shown.
 */
export default function UsageMeter() {
  const workbench = useWorkbench();
  const { plugins } = usePlugins();
  // Per-source values, errors and fetch times; seeded from the display cache.
  const [meters, setMeters] = useState(readCache);
  // Sources with a request in flight; drives the refresh button's spinner.
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const metersRef = useRef(meters);
  metersRef.current = meters;

  const meterSettings = workbench?.settings.usageMeter;
  const enabledPlugins = new Set(plugins.filter((plugin) => plugin.enabled).map((plugin) => plugin.name));
  const hidden = new Set(meterSettings?.hiddenSources ?? []);
  const sources = [...BUILTIN_USAGE_SOURCES, ...(meterSettings?.customSources ?? [])]
    .filter((source) => enabledPlugins.has(source.plugin) && !hidden.has(source.id));
  const sourceKey = sources.map((source) => `${source.id}:${source.plugin}:${source.route}:${source.parser}`).join(',');

  const refresh = useCallback(async (targets: MeterSource[]) => {
    setPending((current) => new Set([...current, ...targets.map((target) => target.id)]));
    await Promise.all(targets.map(async (source) => {
      let next: MeterState;
      try {
        const windows = parseUsage(source.parser, await workbenchApi.pluginRpc(source.plugin, source.route));
        if (!windows) throw new Error('响应格式无法解析');
        next = { ...windows, updated: Date.now(), error: '' };
      } catch (error) {
        const previous = metersRef.current[source.id];
        next = {
          h5: previous?.h5 ?? null,
          d7: previous?.d7 ?? null,
          h5ResetAt: previous?.h5ResetAt ?? null,
          d7ResetAt: previous?.d7ResetAt ?? null,
          updated: previous?.updated ?? 0,
          error: error instanceof Error ? error.message : String(error),
        };
      }
      setMeters((current) => {
        const updated = { ...current, [source.id]: next };
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(updated)); } catch { /* display cache only */ }
        return updated;
      });
      setPending((current) => {
        const remaining = new Set(current);
        remaining.delete(source.id);
        return remaining;
      });
    }));
  }, []);

  const isEnabled = Boolean(workbench?.isReady && meterSettings?.enabled);
  const refreshMinutes = meterSettings?.refreshMinutes ?? 5;

  useEffect(() => {
    if (!isEnabled || sources.length === 0) return undefined;
    void refresh(sources);
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh(sources);
    }, refreshMinutes * 60_000);
    return () => window.clearInterval(timer);
    // sourceKey stands in for `sources`, which is rebuilt every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEnabled, refresh, refreshMinutes, sourceKey]);

  if (!isEnabled || sources.length === 0) return null;

  const errors = sources.filter((source) => meters[source.id]?.error).map((source) => `${source.label}: ${meters[source.id]?.error}`);

  return (
    <section
      aria-label="用量"
      className="mx-2 mb-1.5 mt-1.5 hidden rounded-[10px] border border-border/65 bg-muted/[0.13] px-2.5 py-2 text-[11px] text-foreground md:block"
    >
      <div className="grid min-h-[22px] grid-cols-[minmax(0,1fr)_46px_46px] items-center gap-1.5">
        <button
          type="button"
          onClick={() => { void refresh(sources); }}
          disabled={pending.size > 0}
          title="立即刷新"
          aria-label="刷新用量"
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/70 hover:bg-accent/40 hover:text-muted-foreground disabled:cursor-wait disabled:opacity-50"
        >
          <RotateCw className={cn('h-3 w-3', pending.size > 0 && 'animate-spin')} />
        </button>
        <span className="text-right text-[10px] text-muted-foreground">5h</span>
        <span className="text-right text-[10px] text-muted-foreground">7d</span>
      </div>
      {sources.map((source) => {
        const meter = meters[source.id];
        const stale = Boolean(meter?.error);
        const title = meter?.error
          || (meter?.updated ? `更新时间：${new Date(meter.updated).toLocaleString()}` : '尚未获取数据');
        return (
          <div key={source.id} className="grid min-h-[25px] grid-cols-[minmax(0,1fr)_46px_46px] items-center gap-1.5">
            <span className="flex min-w-0 items-center gap-1.5 overflow-hidden font-semibold" style={{ color: source.color }}>
              <SourceIcon source={source} />
              <span className="truncate">{source.label}</span>
            </span>
            <Metric value={meter?.h5 ?? null} resetAt={meter?.h5ResetAt ?? null} window="h5" color={source.color} stale={stale} title={title} />
            <Metric value={meter?.d7 ?? null} resetAt={meter?.d7ResetAt ?? null} window="d7" color={source.color} stale={stale} title={title} />
          </div>
        );
      })}
      {errors.length > 0 && <p className="mt-1 break-words text-[10px] text-yellow-500">{errors.join(' | ')}</p>}
    </section>
  );
}
