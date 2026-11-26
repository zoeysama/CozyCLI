// CozyCLI: workbench customizations (project identity, session tags, sidebar
// filter, activity bar, quick sessions, usage meter, cleanup toggles).
// Everything upstream files touch goes through this barrel.
export { WorkbenchProvider } from '@/modules/workbench/context/WorkbenchContext';
export type { WorkbenchHost } from '@/modules/workbench/context/WorkbenchContext';
export { default as ActivityBar } from '@/modules/workbench/ActivityBar';
export { default as ProjectDot } from '@/modules/workbench/ProjectBadge';
export { ProjectColorStripe, ProjectInlineLabel, ProjectName } from '@/modules/workbench/ProjectMarkers';
export { default as SessionTagChips } from '@/modules/workbench/SessionTagChips';
export { default as SessionStatusIndicator, useStatusSlotEnabled } from '@/modules/workbench/SessionStatusIndicator';
export { default as SidebarLabelFilter } from '@/modules/workbench/SidebarLabelFilter';
export { default as SidebarQuickActions } from '@/modules/workbench/SidebarQuickActions';
export { default as UsageMeter } from '@/modules/workbench/UsageMeter';
export { default as NewSessionLauncher } from '@/modules/workbench/NewSessionLauncher';
export { default as TurnNavigator, TURN_START_CLASS } from '@/modules/workbench/TurnNavigator';
export { default as ChatAvatar, useChatDisplayName } from '@/modules/workbench/ChatAvatar';
export { useLabelFilteredLists } from '@/modules/workbench/hooks/useLabelFilteredLists';
export { useStatusView } from '@/modules/workbench/hooks/useStatusView';
export { default as StatusFilterTabs } from '@/modules/workbench/StatusFilterTabs';
export {
  useActivityBarEnabled,
  useApplySidebarModeSetting,
  useShowNewSessionLauncher,
  useInitialSidebarMode,
  useOpenSessionTags,
  useProjectCreatedAtLookup,
  useWorkbenchCleanup,
} from '@/modules/workbench/hooks/useWorkbenchIntegration';
