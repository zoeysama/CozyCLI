import { cn } from '@/shared/utils';
import { useWorkbench, type StatusFilter } from '@/modules/workbench/context/WorkbenchContext';

const TABS: { id: StatusFilter; label: string; hint: string }[] = [
  { id: 'active', label: '运行中', hint: '正在运行、后台任务或定了闹钟' },
  { id: 'unread', label: '未读', hint: '有你没看过的新内容' },
  { id: 'flagged', label: '有标记', hint: '运行中或未读：任何带状态标记的会话' },
  { id: 'all', label: '全部', hint: '所有会话' },
];

/** Used by the sidebar's status view: the tab row choosing which sessions it lists. */
export default function StatusFilterTabs({ counts }: { counts: Record<StatusFilter, number> }) {
  const workbench = useWorkbench();
  if (!workbench) return null;
  return (
    <div role="tablist" aria-label="按状态筛选" className="mx-2 mb-1.5 grid grid-cols-4 gap-0.5 rounded-lg bg-muted/50 p-0.5">
      {TABS.map((tab) => {
        const isActive = workbench.statusFilter === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            title={tab.hint}
            onClick={() => workbench.setStatusFilter(tab.id)}
            className={cn(
              'flex items-center justify-center gap-1 rounded-md px-1 py-1 text-[11px] transition-colors',
              isActive ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
            {tab.id !== 'all' && <span className="tabular-nums opacity-70">{counts[tab.id]}</span>}
          </button>
        );
      })}
    </div>
  );
}
