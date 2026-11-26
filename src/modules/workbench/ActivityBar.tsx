import { Fragment, type KeyboardEvent, type ReactNode } from 'react';
import { Loader2, PanelLeftOpen, Settings, SlidersHorizontal, SquarePen, Zap } from 'lucide-react';

import { Tooltip } from '@/shared/ui';
import { cn } from '@/shared/utils';
import { useUiPreferences, useSetUiPreference } from '@/shared/context/UiPreferencesContext';
import { PluginIcon } from '@/modules/plugins';
import { useWorkbench, useWorkbenchHost } from '@/modules/workbench/context/WorkbenchContext';
import { useActivityBarItems, type ActivityBarItem } from '@/modules/workbench/hooks/useActivityBarItems';

/** Moves focus between the view buttons with the arrow keys, like a vertical tablist. */
function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
  const tabList = event.currentTarget.closest('[role="tablist"]');
  if (!tabList) return;
  const tabs = Array.from(tabList.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  const index = tabs.indexOf(event.currentTarget);
  let next: number;
  if (event.key === 'ArrowDown') next = (index + 1) % tabs.length;
  else if (event.key === 'ArrowUp') next = (index - 1 + tabs.length) % tabs.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = tabs.length - 1;
  else return;
  event.preventDefault();
  tabs[next]?.focus();
  tabs[next]?.click();
}

function BarButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <Tooltip content={label} position="right">
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        disabled={disabled}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/80 hover:text-foreground disabled:opacity-50"
      >
        {children}
      </button>
    </Tooltip>
  );
}

function ViewButton({ item, isActive, onSelect }: { item: ActivityBarItem; isActive: boolean; onSelect: () => void }) {
  return (
    <div className="relative flex w-full justify-center">
      {/* The active marker sits on the bar's edge, as in VS Code. */}
      <span
        aria-hidden="true"
        className={cn(
          'absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary transition-opacity',
          isActive ? 'opacity-100' : 'opacity-0',
        )}
      />
      <Tooltip content={item.label} position="right">
        <button
          type="button"
          role="tab"
          aria-label={item.label}
          aria-selected={isActive}
          tabIndex={isActive ? 0 : -1}
          onClick={onSelect}
          onKeyDown={handleTabKeyDown}
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
            isActive
              ? 'bg-accent text-foreground'
              : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
          )}
        >
          {item.kind === 'builtin' ? (
            <item.icon className="h-[18px] w-[18px]" strokeWidth={isActive ? 2.1 : 1.8} />
          ) : (
            <PluginIcon
              pluginName={item.pluginName}
              iconFile={item.iconFile}
              className="flex h-[18px] w-[18px] items-center justify-center [&>svg]:h-full [&>svg]:w-full"
            />
          )}
        </button>
      </Tooltip>
    </div>
  );
}

/**
 * Used by the project-workspace module (ActivityBarRegion) on desktop: the
 * vertical bar between the sidebar and the workspace that switches between
 * every view and plugin. When the sidebar is hidden it also takes over the
 * collapsed rail's job (show sidebar, new session).
 */
export default function ActivityBar() {
  const workbench = useWorkbench();
  const host = useWorkbenchHost();
  const items = useActivityBarItems();
  const { sidebarVisible } = useUiPreferences();
  const setPreference = useSetUiPreference();

  if (!workbench || !host || !workbench.isReady || !workbench.settings.activityBar.enabled || host.isMobile) {
    return null;
  }

  const hidden = new Set(workbench.settings.activityBar.hiddenItems);
  const builtin = items.builtin.filter((item) => !hidden.has(item.id));
  const plugins = items.plugins.filter((item) => !hidden.has(item.id));
  const groups = [builtin, plugins].filter((group) => group.length > 0);

  return (
    <nav
      aria-label="工作区视图"
      className="flex h-full w-11 flex-shrink-0 flex-col items-center border-r border-border/50 bg-background/80 py-2"
    >
      {!sidebarVisible && (
        <div className="mb-1 flex flex-col items-center gap-1 border-b border-border/50 pb-2">
          <BarButton label="显示侧边栏" onClick={() => setPreference('sidebarVisible', true)}>
            <PanelLeftOpen className="h-4 w-4" />
          </BarButton>
          <BarButton label="在当前项目新建会话（Ctrl/⌘+Alt+N）" onClick={workbench.startSessionInCurrentProject}>
            <SquarePen className="h-4 w-4" />
          </BarButton>
          <BarButton label="快捷会话（Ctrl/⌘+Alt+K）" onClick={() => { void workbench.startQuickSession(); }} disabled={workbench.isStartingQuickSession}>
            {workbench.isStartingQuickSession ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          </BarButton>
        </div>
      )}

      <div
        role="tablist"
        aria-orientation="vertical"
        aria-label="工作区视图"
        className="scrollbar-hide flex min-h-0 w-full flex-1 flex-col items-center gap-1 overflow-y-auto py-1"
      >
        {groups.map((group, groupIndex) => (
          <Fragment key={groupIndex}>
            {groupIndex > 0 && <span aria-hidden="true" className="my-1 h-px w-6 flex-shrink-0 bg-border" />}
            {group.map((item) => (
              <ViewButton
                key={item.id}
                item={item}
                isActive={host.activeTab === item.id}
                onSelect={() => { workbench.closeLauncher(); host.setActiveTab(item.id); }}
              />
            ))}
          </Fragment>
        ))}
      </div>

      <div className="mt-1 flex flex-col items-center gap-1 border-t border-border/50 pt-2">
        <BarButton label="界面定制" onClick={() => workbench.openDialog({ kind: 'settings' })}>
          <SlidersHorizontal className="h-4 w-4" />
        </BarButton>
        <BarButton label="设置" onClick={host.onShowSettings}>
          <Settings className="h-4 w-4" />
        </BarButton>
      </div>
    </nav>
  );
}
