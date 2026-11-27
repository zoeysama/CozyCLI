import { Fragment, useCallback, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Loader2, MoreHorizontal, PanelLeftOpen, Settings, SlidersHorizontal, SquarePen, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Tooltip } from '@/shared/ui';
import { cn } from '@/shared/utils';
import { useUiPreferences, useSetUiPreference } from '@/shared/context/UiPreferencesContext';
import { PluginIcon } from '@/modules/plugins';
import { useWorkbench, useWorkbenchHost } from '@/modules/workbench/context/WorkbenchContext';
import { useOrderedActivityBarItems, type ActivityBarItem } from '@/modules/workbench/hooks/useActivityBarItems';
import FloatingMenu from '@/modules/workbench/FloatingMenu';
import { fitItems, moveItem } from '@/modules/workbench/utils/activityBarOrder';

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

function ItemIcon({ item, isActive }: { item: ActivityBarItem; isActive?: boolean }) {
  return item.kind === 'builtin' ? (
    <item.icon className="h-[18px] w-[18px]" strokeWidth={isActive ? 2.1 : 1.8} />
  ) : (
    <PluginIcon
      pluginName={item.pluginName}
      iconFile={item.iconFile}
      className="flex h-[18px] w-[18px] items-center justify-center [&>svg]:h-full [&>svg]:w-full"
    />
  );
}

type DropMark = { id: string; before: boolean } | null;

function ViewButton({
  item,
  isActive,
  onSelect,
  dropMark,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  item: ActivityBarItem;
  isActive: boolean;
  onSelect: () => void;
  dropMark: DropMark;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
}) {
  const marked = dropMark?.id === item.id;
  return (
    <div
      className="relative flex w-full flex-shrink-0 justify-center"
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      {/* The active marker sits on the bar's edge, as in VS Code. */}
      <span
        aria-hidden="true"
        className={cn(
          'absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary transition-opacity',
          isActive ? 'opacity-100' : 'opacity-0',
        )}
      />
      {marked && (
        <span
          aria-hidden="true"
          className={cn('pointer-events-none absolute left-1.5 right-1.5 h-0.5 rounded-full bg-primary', dropMark.before ? '-top-[3px]' : '-bottom-[3px]')}
        />
      )}
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
          <ItemIcon item={item} isActive={isActive} />
        </button>
      </Tooltip>
    </div>
  );
}

/** Watches an element's height (via a callback ref), for deciding how many bar items fit. */
function useElementHeight<T extends HTMLElement>() {
  const [height, setHeight] = useState(0);
  const observerRef = useRef<ResizeObserver | null>(null);
  const ref = useCallback((element: T | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!element) return;
    const update = () => setHeight(element.clientHeight);
    update();
    observerRef.current = new ResizeObserver(update);
    observerRef.current.observe(element);
  }, []);
  return [ref, height] as const;
}

/**
 * Used by the project-workspace module (ActivityBarRegion) on desktop: the
 * vertical bar between the sidebar and the workspace that switches between
 * every view and plugin. When the sidebar is hidden it also takes over the
 * collapsed rail's job (show sidebar, new session).
 */
export default function ActivityBar() {
  const workbench = useWorkbench();
  const { t } = useTranslation('workbench');
  const host = useWorkbenchHost();
  const { sidebarVisible } = useUiPreferences();
  const setPreference = useSetUiPreference();
  const barSettings = workbench?.settings.activityBar;
  const { all, visible } = useOrderedActivityBarItems(barSettings?.order ?? [], barSettings?.hiddenItems ?? []);
  const [listRef, listHeight] = useElementHeight<HTMLDivElement>();
  const moreRef = useRef<HTMLButtonElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropMark, setDropMark] = useState<DropMark>(null);
  const closeMore = useCallback(() => setMoreOpen(false), []);

  if (!workbench || !host || !workbench.isReady || !barSettings?.enabled || host.isMobile) {
    return null;
  }

  // Whatever does not fit goes behind the "more" button; the active view always stays on the bar.
  const fit = fitItems(visible, listHeight - 8);
  let shown = visible.slice(0, fit);
  let overflow = visible.slice(fit);
  const activeIndex = overflow.findIndex((item) => item.id === host.activeTab);
  if (activeIndex >= 0 && shown.length > 0) {
    const displaced = shown[shown.length - 1];
    shown = [...shown.slice(0, -1), overflow[activeIndex]];
    overflow = [displaced, ...overflow.filter((_, index) => index !== activeIndex)];
  }
  if (listHeight === 0) { shown = visible; overflow = []; }

  const moreButton = (
    <button
      ref={moreRef}
      type="button"
      aria-label={t('activityBar.moreViews', { count: overflow.length })}
      aria-haspopup="menu"
      aria-expanded={moreOpen}
      onClick={() => setMoreOpen((value) => !value)}
      className={cn(
        'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground',
        moreOpen && 'bg-accent text-foreground',
      )}
    >
      <MoreHorizontal className="h-[18px] w-[18px]" />
    </button>
  );

  const select = (id: ActivityBarItem['id']) => { workbench.closeLauncher(); host.setActiveTab(id); };

  // Drag to reorder: the order covers every item, hidden ones too, so hiding one keeps its place.
  const dragHandlers = (item: ActivityBarItem) => ({
    onDragStart: (event: DragEvent<HTMLElement>) => {
      setDragId(item.id);
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', item.id);
    },
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (!dragId) return;
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      const before = event.clientY < rect.top + rect.height / 2;
      if (dropMark?.id !== item.id || dropMark.before !== before) setDropMark({ id: item.id, before });
    },
    onDrop: (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      if (dragId && dropMark && dragId !== dropMark.id) {
        const ids = all.map((entry) => entry.id as string);
        const targetIndex = ids.indexOf(dropMark.id);
        const beforeId = dropMark.before ? dropMark.id : ids.slice(targetIndex + 1).find((id) => id !== dragId) ?? null;
        const order = moveItem(ids, dragId, beforeId);
        workbench.saveSettings({ activityBar: { order } });
      }
      setDragId(null);
      setDropMark(null);
    },
    onDragEnd: () => { setDragId(null); setDropMark(null); },
  });

  return (
    <nav
      aria-label={t('activityBar.views')}
      className="flex h-full w-11 flex-shrink-0 flex-col items-center border-r border-border/50 bg-background/80 py-2"
    >
      {!sidebarVisible && (
        <div className="mb-1 flex flex-col items-center gap-1 border-b border-border/50 pb-2">
          <BarButton label={t('activityBar.showSidebar')} onClick={() => setPreference('sidebarVisible', true)}>
            <PanelLeftOpen className="h-4 w-4" />
          </BarButton>
          <BarButton label={t('activityBar.newSessionHere')} onClick={workbench.startSessionInCurrentProject}>
            <SquarePen className="h-4 w-4" />
          </BarButton>
          <BarButton label={t('activityBar.quickSession')} onClick={() => { void workbench.startQuickSession(); }} disabled={workbench.isStartingQuickSession}>
            {workbench.isStartingQuickSession ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          </BarButton>
        </div>
      )}

      <div
        role="tablist"
        aria-orientation="vertical"
        aria-label={t('activityBar.views')}
        ref={listRef}
        className="flex min-h-0 w-full flex-1 flex-col items-center gap-1 overflow-hidden py-1"
      >
        {shown.map((item, index) => (
          <Fragment key={item.id}>
            {index > 0 && shown[index - 1].kind !== item.kind && (
              <span aria-hidden="true" className="my-1 h-px w-6 flex-shrink-0 bg-border" />
            )}
            <ViewButton
              item={item}
              isActive={host.activeTab === item.id}
              onSelect={() => select(item.id)}
              dropMark={dropMark}
              {...dragHandlers(item)}
            />
          </Fragment>
        ))}
        {overflow.length > 0 && (
          <>
            <span aria-hidden="true" className="my-1 h-px w-6 flex-shrink-0 bg-border" />
            {/* No tooltip while the menu is open: it would cover the menu's last row. */}
            {moreOpen ? moreButton : <Tooltip content={t('activityBar.more', { count: overflow.length })} position="right">{moreButton}</Tooltip>}
          </>
        )}
      </div>
      <FloatingMenu anchorRef={moreRef} open={moreOpen && overflow.length > 0} onClose={closeMore} placement="right-end" ariaLabel={t('activityBar.moreMenu')}>
        {overflow.map((item) => (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            onClick={() => { setMoreOpen(false); select(item.id); }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-accent"
          >
            <span className="flex h-5 w-5 items-center justify-center text-muted-foreground"><ItemIcon item={item} /></span>
            <span className="truncate">{item.label}</span>
          </button>
        ))}
        <div className="my-1 h-px bg-border" aria-hidden />
        <button
          type="button"
          role="menuitem"
          onClick={() => { setMoreOpen(false); workbench.openDialog({ kind: 'settings' }); }}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent"
        >
          {t('activityBar.reorder')}
        </button>
      </FloatingMenu>

      <div className="mt-1 flex flex-col items-center gap-1 border-t border-border/50 pt-2">
        <BarButton label={t('activityBar.customize')} onClick={() => workbench.openDialog({ kind: 'settings' })}>
          <SlidersHorizontal className="h-4 w-4" />
        </BarButton>
        <BarButton label={t('activityBar.settings')} onClick={host.onShowSettings}>
          <Settings className="h-4 w-4" />
        </BarButton>
      </div>
    </nav>
  );
}
