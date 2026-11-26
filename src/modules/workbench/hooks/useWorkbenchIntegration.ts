import { useCallback, useEffect, useRef } from 'react';

import type { Project } from '@/shared/types';
import { useWorkbench } from '@/modules/workbench/context/WorkbenchContext';
import type { WorkbenchSettings } from '@/modules/workbench/utils/workbenchSettings';

/**
 * Small, null-safe hooks for the upstream files the fork patches. Each one
 * returns a neutral value outside the workbench provider, so the patched
 * component behaves exactly as upstream there (tests, standalone shells).
 */

/** Used by the sidebar footer, header and collapsed rail to honour the cleanup toggles; null means "show everything". */
export function useWorkbenchCleanup(): WorkbenchSettings['cleanup'] | null {
  const workbench = useWorkbench();
  return workbench?.isReady ? workbench.settings.cleanup : null;
}

/** Used by the workspace header and the sidebar to know whether the activity bar replaces the top tabs and collapsed rail. */
export function useActivityBarEnabled(): boolean {
  const workbench = useWorkbench();
  return Boolean(workbench?.isReady && workbench.settings.activityBar.enabled);
}

/** Used by the sidebar's session options menu; null when tags are unavailable. */
export function useOpenSessionTags(): ((sessionId: string, sessionName: string) => void) | null {
  const workbench = useWorkbench();
  const openDialog = workbench?.openDialog;
  const open = useCallback((sessionId: string, sessionName: string) => {
    openDialog?.({ kind: 'session-tags', sessionId, sessionName });
  }, [openDialog]);
  return openDialog ? open : null;
}

/**
 * Used by the sidebar controller's project sort: the folder creation time of
 * a project (ms), or 0 when unknown or when the setting is off. The returned
 * function is stable while the data is unchanged.
 */
export function useProjectCreatedAtLookup(): (project: Project) => number {
  const workbench = useWorkbench();
  const createdAt = workbench?.projectCreatedAt;
  const enabled = Boolean(workbench?.isReady && workbench.settings.newProjectsFirst);
  return useCallback(
    (project: Project) => (enabled && createdAt ? createdAt[project.projectId] ?? 0 : 0),
    [createdAt, enabled],
  );
}

/**
 * Used by the sidebar controller for the list a page load opens on. The
 * initial value is the workbench default ('conversations') because the stored
 * setting arrives after the first render; the setting is applied once when it
 * does. Outside the workbench the upstream default ('projects') is kept.
 */
export function useInitialSidebarMode(): 'conversations' | 'projects' {
  return useWorkbench() ? 'conversations' : 'projects';
}

/** Companion of useInitialSidebarMode: switches to the stored mode once it has loaded. */
export function useApplySidebarModeSetting(setMode: (mode: 'conversations' | 'projects') => void): void {
  const workbench = useWorkbench();
  const mode = workbench?.isReady ? workbench.settings.sidebarDefaultMode : null;
  const appliedRef = useRef(false);
  useEffect(() => {
    if (!mode || appliedRef.current) return;
    appliedRef.current = true;
    if (mode !== 'conversations') setMode(mode);
  }, [mode, setMode]);
}

/**
 * Used by the project-workspace main region: whether the new-session launcher
 * replaces the workspace — when opened from the pencil button, or when no
 * project is selected (instead of upstream's empty "choose a project" view).
 * Desktop only.
 */
export function useShowNewSessionLauncher(hasSelectedProject: boolean, isLoading: boolean, isMobile: boolean): boolean {
  const workbench = useWorkbench();
  if (!workbench?.isReady || isMobile) return false;
  return workbench.isLauncherOpen || (!hasSelectedProject && !isLoading);
}
