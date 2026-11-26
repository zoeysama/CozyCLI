import { useMemo, type ReactNode } from 'react';

import { WorkbenchProvider, type WorkbenchHost } from '@/modules/workbench';
import {
  useProjectMainState,
  useProjectSidebarState,
} from '@/modules/project-workspace/context/ProjectsStateContext';

/**
 * CozyCLI: rendered by ProjectWorkspaceShell around the whole workspace. It hands
 * the fork's workbench module the project workspace state it needs (projects,
 * selection, new-session and tab switching) without the workbench reaching
 * into this module's private contexts.
 */
export default function WorkbenchHostBridge({ isMobile, children }: { isMobile: boolean; children: ReactNode }) {
  const { sidebarSharedProps } = useProjectSidebarState();
  const { activeTab, setActiveTab, refreshProjectsSilently } = useProjectMainState();
  const { projects, selectedProject, selectedSession, onNewSession, onShowSettings } = sidebarSharedProps;

  const host = useMemo<WorkbenchHost>(() => ({
    projects,
    selectedProject,
    selectedSession,
    onNewSession,
    refreshProjects: refreshProjectsSilently,
    activeTab,
    setActiveTab,
    onShowSettings,
    isMobile,
  }), [
    activeTab, isMobile, onNewSession, onShowSettings, projects, refreshProjectsSilently,
    selectedProject, selectedSession, setActiveTab,
  ]);

  return <WorkbenchProvider host={host}>{children}</WorkbenchProvider>;
}
