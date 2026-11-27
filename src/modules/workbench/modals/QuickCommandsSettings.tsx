import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Input } from '@/shared/ui';
import { useWorkbench } from '@/modules/workbench/context/WorkbenchContext';
import { shiftItem } from '@/modules/workbench/utils/activityBarOrder';
import { getDefaultQuickCommands, type QuickCommand } from '@/modules/workbench/utils/workbenchSettings';

const iconButton = 'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent';

/**
 * CozyCLI: edits the composer's common-commands list (WorkbenchSettingsDialog).
 * Text fields are drafts saved on blur, so typing is not a request per key.
 */
export default function QuickCommandsSettings() {
  const workbench = useWorkbench();
  const { t } = useTranslation('workbench');
  const saved = workbench?.settings.quickCommands ?? getDefaultQuickCommands();
  const [drafts, setDrafts] = useState<QuickCommand[]>(saved);

  // Another device (or a reset) changed the list: show it.
  const savedKey = JSON.stringify(saved);
  useEffect(() => { setDrafts(JSON.parse(savedKey) as QuickCommand[]); }, [savedKey]);

  if (!workbench) return null;

  const commit = (next: QuickCommand[]) => {
    setDrafts(next);
    const clean = next.filter((command) => command.text.trim());
    if (JSON.stringify(clean) !== savedKey) workbench.saveSettings({ quickCommands: clean });
  };
  const edit = (id: string, patch: Partial<QuickCommand>) =>
    setDrafts((list) => list.map((command) => (command.id === id ? { ...command, ...patch } : command)));
  const move = (id: string, delta: -1 | 1) => {
    const ids = shiftItem(drafts.map((command) => command.id), id, delta);
    commit(ids.map((entry) => drafts.find((command) => command.id === entry)!));
  };

  return (
    <div className="space-y-2 py-2">
      <p className="text-xs text-muted-foreground">{t('quickCommands.settingsHint')}</p>
      {drafts.map((command, index) => (
        <div key={command.id} className="space-y-1.5 rounded-md border border-border/60 p-2">
          <div className="flex items-center gap-1.5">
            <Input
              aria-label={t('quickCommands.name')}
              placeholder={t('quickCommands.namePlaceholder')}
              value={command.label}
              onChange={(event) => edit(command.id, { label: event.target.value })}
              onBlur={() => commit(drafts)}
              className="h-7 flex-1 text-sm"
            />
            <select
              aria-label={t('quickCommands.onClick')}
              value={command.send ? 'send' : 'insert'}
              onChange={(event) => commit(drafts.map((entry) => (entry.id === command.id ? { ...entry, send: event.target.value === 'send' } : entry)))}
              className="h-7 rounded-md border border-input bg-background px-1.5 text-xs"
            >
              <option value="send">{t('quickCommands.send')}</option>
              <option value="insert">{t('quickCommands.insert')}</option>
            </select>
            <button type="button" aria-label={t('common.moveUp')} className={iconButton} disabled={index === 0} onClick={() => move(command.id, -1)}>
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button type="button" aria-label={t('common.moveDown')} className={iconButton} disabled={index === drafts.length - 1} onClick={() => move(command.id, 1)}>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <button type="button" aria-label={t('common.delete')} className={iconButton} onClick={() => commit(drafts.filter((entry) => entry.id !== command.id))}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <textarea
            aria-label={t('quickCommands.content')}
            placeholder={t('quickCommands.contentPlaceholder')}
            value={command.text}
            rows={Math.min(4, Math.max(1, command.text.split('\n').length))}
            onChange={(event) => edit(command.id, { text: event.target.value })}
            onBlur={() => commit(drafts)}
            className="w-full resize-y rounded-md border border-input bg-background px-2 py-1 font-mono text-xs"
          />
        </div>
      ))}
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="flex items-center gap-1 text-xs text-primary hover:underline"
          onClick={() => setDrafts((list) => [...list, { id: `cmd-${Date.now().toString(36)}`, label: '', text: '', send: true }])}
        >
          <Plus className="h-3.5 w-3.5" />{t('quickCommands.add')}
        </button>
        <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => commit(getDefaultQuickCommands())}>
          <RotateCcw className="h-3 w-3" />{t('quickCommands.reset')}
        </button>
      </div>
    </div>
  );
}
