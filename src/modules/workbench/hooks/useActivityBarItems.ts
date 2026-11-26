import { ClipboardCheck, Folder, GitBranch, MessageSquare, MonitorPlay, Terminal, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { AppTab } from '@/shared/types';
import { usePlugins } from '@/modules/plugins';
import { useBrowserUseEnabled } from '@/modules/browser-use';
import { useTasksSettings } from '@/modules/task-master';

/** One view the activity bar can switch to. */
export type ActivityBarItem =
  | { kind: 'builtin'; id: AppTab; label: string; icon: LucideIcon }
  | { kind: 'plugin'; id: AppTab; label: string; pluginName: string; iconFile: string };

/**
 * The views the workspace offers, in the same order and under the same
 * conditions as upstream's WorkspaceTabs (browser and tasks only when
 * enabled, plugins only when enabled). Used by the activity bar and by the
 * settings dialog's "hide items" list.
 */
export function useActivityBarItems(): { builtin: ActivityBarItem[]; plugins: ActivityBarItem[] } {
  const { t } = useTranslation();
  const { plugins } = usePlugins();
  const browserUseEnabled = useBrowserUseEnabled();
  const { tasksEnabled, isTaskMasterInstalled } = useTasksSettings();

  const builtin: ActivityBarItem[] = [
    { kind: 'builtin', id: 'chat', label: t('tabs.chat'), icon: MessageSquare },
    { kind: 'builtin', id: 'shell', label: t('tabs.shell'), icon: Terminal },
    { kind: 'builtin', id: 'files', label: t('tabs.files'), icon: Folder },
    { kind: 'builtin', id: 'git', label: t('tabs.git'), icon: GitBranch },
    ...(browserUseEnabled ? [{ kind: 'builtin' as const, id: 'browser' as AppTab, label: t('tabs.browser'), icon: MonitorPlay }] : []),
    ...(tasksEnabled && isTaskMasterInstalled
      ? [{ kind: 'builtin' as const, id: 'tasks' as AppTab, label: t('tabs.tasks'), icon: ClipboardCheck }]
      : []),
  ];

  const pluginItems: ActivityBarItem[] = plugins
    .filter((plugin) => plugin.enabled)
    .map((plugin) => ({
      kind: 'plugin',
      id: `plugin:${plugin.name}` as AppTab,
      label: plugin.displayName,
      pluginName: plugin.name,
      iconFile: plugin.icon,
    }));

  return { builtin, plugins: pluginItems };
}
