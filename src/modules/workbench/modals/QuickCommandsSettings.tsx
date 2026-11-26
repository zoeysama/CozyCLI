import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Plus, RotateCcw, Trash2 } from 'lucide-react';

import { Input } from '@/shared/ui';
import { useWorkbench } from '@/modules/workbench/context/WorkbenchContext';
import { shiftItem } from '@/modules/workbench/utils/activityBarOrder';
import { DEFAULT_QUICK_COMMANDS, type QuickCommand } from '@/modules/workbench/utils/workbenchSettings';

const iconButton = 'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent';

/**
 * CozyCLI: edits the composer's common-commands list (WorkbenchSettingsDialog).
 * Text fields are drafts saved on blur, so typing is not a request per key.
 */
export default function QuickCommandsSettings() {
  const workbench = useWorkbench();
  const saved = workbench?.settings.quickCommands ?? DEFAULT_QUICK_COMMANDS;
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
      <p className="text-xs text-muted-foreground">
        在输入框工具栏的「常用命令」按钮（方框斜杠图标）里。「发送」会直接发出去（比如 <code>/compact</code>），「插入」只放进输入框；按住 Shift 点击可以反过来。
      </p>
      {drafts.map((command, index) => (
        <div key={command.id} className="space-y-1.5 rounded-md border border-border/60 p-2">
          <div className="flex items-center gap-1.5">
            <Input
              aria-label="名称"
              placeholder="名称（可留空）"
              value={command.label}
              onChange={(event) => edit(command.id, { label: event.target.value })}
              onBlur={() => commit(drafts)}
              className="h-7 flex-1 text-sm"
            />
            <select
              aria-label="点击时"
              value={command.send ? 'send' : 'insert'}
              onChange={(event) => commit(drafts.map((entry) => (entry.id === command.id ? { ...entry, send: event.target.value === 'send' } : entry)))}
              className="h-7 rounded-md border border-input bg-background px-1.5 text-xs"
            >
              <option value="send">发送</option>
              <option value="insert">插入</option>
            </select>
            <button type="button" aria-label="上移" className={iconButton} disabled={index === 0} onClick={() => move(command.id, -1)}>
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button type="button" aria-label="下移" className={iconButton} disabled={index === drafts.length - 1} onClick={() => move(command.id, 1)}>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <button type="button" aria-label="删除" className={iconButton} onClick={() => commit(drafts.filter((entry) => entry.id !== command.id))}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <textarea
            aria-label="内容"
            placeholder="/compact 或一段提示词"
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
          <Plus className="h-3.5 w-3.5" />添加命令
        </button>
        <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => commit(DEFAULT_QUICK_COMMANDS)}>
          <RotateCcw className="h-3 w-3" />恢复默认
        </button>
      </div>
    </div>
  );
}
