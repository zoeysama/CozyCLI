import { Loader2, SquarePen, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button, Tooltip } from '@/shared/ui';
import { useWorkbench } from '@/modules/workbench/context/WorkbenchContext';

const BUTTON_CLASS = 'h-7 w-7 rounded-lg p-0 text-muted-foreground hover:bg-accent/80 hover:text-foreground';

/**
 * Used by the sidebar header (desktop) for the two new-session shortcuts:
 * a session in the current project, and a quick session in the scratch folder.
 */
export default function SidebarQuickActions() {
  const workbench = useWorkbench();
  const { t } = useTranslation('workbench');
  if (!workbench) return null;

  return (
    <div className="flex flex-shrink-0 items-center gap-0.5">
      <Tooltip content={t('quickActions.newSessionTip')} position="bottom">
        <Button
          variant="ghost"
          size="sm"
          className={BUTTON_CLASS}
          aria-label={t('quickActions.newSession')}
          onClick={workbench.startSessionInCurrentProject}
        >
          <SquarePen className="h-3.5 w-3.5" />
        </Button>
      </Tooltip>
      <Tooltip content={t('quickActions.quickTip')} position="bottom">
        <Button
          variant="ghost"
          size="sm"
          className={BUTTON_CLASS}
          aria-label={t('quickActions.quick')}
          disabled={workbench.isStartingQuickSession}
          onClick={() => { void workbench.startQuickSession(); }}
        >
          {workbench.isStartingQuickSession
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Zap className="h-3.5 w-3.5" />}
        </Button>
      </Tooltip>
    </div>
  );
}
