import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { Button, Input } from '@/shared/ui';
import { usePlugins } from '@/modules/plugins';
import { useWorkbench } from '@/modules/workbench/context/WorkbenchContext';
import type { UsageParserId } from '@/modules/workbench/utils/usageParsers';
import { BUILTIN_USAGE_SOURCES, type UsageSource } from '@/modules/workbench/utils/usageSources';

const PARSER_LABELS: Record<UsageParserId, string> = {
  auto: '自动识别',
  standard: '标准格式',
  claude: 'Claude Usage 格式',
  codex: 'Codex Usage 格式',
};

const EMPTY_DRAFT = { label: '', plugin: '', route: 'usage', color: '#4285f4', parser: 'auto' as UsageParserId };

/**
 * Rendered by the settings dialog: which usage sources the sidebar meter
 * shows, and the form for adding one (e.g. a Gemini usage plugin).
 */
export default function UsageSourcesSettings({ Switch }: {
  Switch: (props: { checked: boolean; onChange: (next: boolean) => void; label: string }) => JSX.Element;
}) {
  const workbench = useWorkbench();
  const { plugins } = usePlugins();
  // The new-source form; null while it is collapsed.
  const [draft, setDraft] = useState<typeof EMPTY_DRAFT | null>(null);
  if (!workbench) return null;

  const { usageMeter } = workbench.settings;
  const hidden = new Set(usageMeter.hiddenSources);
  const installed = new Set(plugins.filter((plugin) => plugin.enabled).map((plugin) => plugin.name));
  const sources: (UsageSource & { custom: boolean })[] = [
    ...BUILTIN_USAGE_SOURCES.map((source) => ({ ...source, custom: false })),
    ...usageMeter.customSources.map((source) => ({ ...source, custom: true })),
  ];

  const setVisible = (id: string, visible: boolean) => {
    const next = visible ? [...hidden].filter((item) => item !== id) : [...hidden, id];
    workbench.saveSettings({ usageMeter: { hiddenSources: next } });
  };
  // Arrays are replaced wholesale by the settings merge, so the full list is sent.
  const saveCustom = (customSources: UsageSource[]) => workbench.saveSettings({ usageMeter: { customSources } });

  const addDraft = () => {
    if (!draft || !draft.label.trim() || !draft.plugin.trim() || !draft.route.trim()) return;
    const id = `custom-${draft.plugin.trim()}-${Date.now().toString(36)}`;
    saveCustom([...usageMeter.customSources, { ...draft, id, label: draft.label.trim(), plugin: draft.plugin.trim(), route: draft.route.trim() }]);
    setDraft(null);
  };

  return (
    <>
      {sources.map((source) => (
        <div key={source.id} className="flex items-center justify-between gap-3 py-1.5">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm text-foreground">
              <span className="h-2 w-2 rounded-full" style={{ background: source.color }} />
              {source.label}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {source.plugin}/rpc/{source.route}
              {!installed.has(source.plugin) && ' · 插件未安装或未启用'}
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-1">
            {source.custom && (
              <button
                type="button"
                title="删除这个来源"
                onClick={() => saveCustom(usageMeter.customSources.filter((item) => item.id !== source.id))}
                className="rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
            <Switch checked={!hidden.has(source.id)} label={`显示 ${source.label}`} onChange={(visible) => setVisible(source.id, visible)} />
          </div>
        </div>
      ))}

      {draft ? (
        <div className="space-y-2 py-2">
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="名称，如 Gemini" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
            <Input
              placeholder="插件名，如 gemini-usage"
              list="workbench-plugin-names"
              value={draft.plugin}
              onChange={(e) => setDraft({ ...draft, plugin: e.target.value })}
            />
            <datalist id="workbench-plugin-names">
              {plugins.map((plugin) => <option key={plugin.name} value={plugin.name}>{plugin.displayName}</option>)}
            </datalist>
            <Input placeholder="RPC 路由，如 usage" value={draft.route} onChange={(e) => setDraft({ ...draft, route: e.target.value })} />
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="颜色"
                value={draft.color}
                onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                className="h-9 w-10 cursor-pointer rounded border border-input bg-transparent"
              />
              <select
                value={draft.parser}
                onChange={(e) => setDraft({ ...draft, parser: e.target.value as UsageParserId })}
                className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"
              >
                {(Object.keys(PARSER_LABELS) as UsageParserId[]).map((parser) => (
                  <option key={parser} value={parser}>{PARSER_LABELS[parser]}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            标准格式：路由返回 <code>{'{ "h5": 12, "d7": 40, "h5ResetAt": "…", "d7ResetAt": "…" }'}</code>，
            或 <code>{'{ "windows": [{ "window": "5h", "usedPercent": 12, "resetsAt": "…" }] }'}</code>。
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setDraft(null)}>取消</Button>
            <Button size="sm" onClick={addDraft} disabled={!draft.label.trim() || !draft.plugin.trim() || !draft.route.trim()}>添加</Button>
          </div>
        </div>
      ) : (
        <div className="py-1.5">
          <Button variant="ghost" size="sm" onClick={() => setDraft(EMPTY_DRAFT)}>
            <Plus className="mr-1 h-3.5 w-3.5" />添加用量来源
          </Button>
        </div>
      )}
    </>
  );
}
