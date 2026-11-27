import { useTranslation } from 'react-i18next';

import { cn } from '@/shared/utils';
import { useWorkbench, type StatusFilter } from '@/modules/workbench/context/WorkbenchContext';

// Labels are `statusTabs.<id>` and hints `statusTabs.<id>Hint` in the workbench namespace.
const TABS: StatusFilter[] = ['active', 'unread', 'flagged', 'all'];

/** Used by the sidebar's status view: the tab row choosing which sessions it lists. */
export default function StatusFilterTabs({ counts }: { counts: Record<StatusFilter, number> }) {
  const workbench = useWorkbench();
  const { t } = useTranslation('workbench');
  if (!workbench) return null;
  return (
    <div role="tablist" aria-label={t('statusTabs.aria')} className="mx-2 mb-1.5 grid grid-cols-4 gap-0.5 rounded-lg bg-muted/50 p-0.5">
      {TABS.map((id) => {
        const tab = { id, label: t(`statusTabs.${id}`), hint: t(`statusTabs.${id}Hint`) };
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
