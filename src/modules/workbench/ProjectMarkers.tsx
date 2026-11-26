import { cn } from '@/shared/utils';
import { useProjectIdentity, useProjectNameClass } from '@/modules/workbench/ProjectBadge';
import { WORKBENCH_PALETTE } from '@/modules/workbench/utils/workbenchPalette';

/**
 * Used by the sidebar's cross-project rows (recents) to paint the owning
 * project's color as a thin bar on the row's left edge. The parent must be
 * `relative`.
 */
export function ProjectColorStripe({ projectId, className }: { projectId: string | null | undefined; className?: string }) {
  const identity = useProjectIdentity(projectId);
  if (!identity) return null;
  return (
    <span
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-y-1.5 left-0 w-[3px] rounded-full', WORKBENCH_PALETTE[identity.color].solid, className)}
    />
  );
}

/**
 * Used by the recents rows and the workspace title: the project name in the
 * project's color (plain text outside the workbench).
 */
export function ProjectInlineLabel({ projectId, name, className }: { projectId: string | null | undefined; name: string; className?: string }) {
  const colorClass = useProjectNameClass(projectId);
  return <span className={cn('truncate', colorClass && `font-medium ${colorClass}`, className)}>{name}</span>;
}

/** Used by the sidebar project rows to color the project name. */
export function ProjectName({ projectId, name, className }: { projectId: string; name: string; className?: string }) {
  const colorClass = useProjectNameClass(projectId);
  return <span className={cn(colorClass, className)}>{name}</span>;
}
