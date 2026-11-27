import type { MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/shared/utils';
import { useWorkbench } from '@/modules/workbench/context/WorkbenchContext';
import {
  WORKBENCH_PALETTE,
  defaultColorFor,
  toColorKey,
  type WorkbenchColorKey,
} from '@/modules/workbench/utils/workbenchPalette';

/** A project's resolved color: the custom one where set, the generated one otherwise. */
export type ResolvedProjectIdentity = {
  color: WorkbenchColorKey;
  isCustom: boolean;
};

/**
 * Used by every workbench piece that shows a project (dot, stripe, colored
 * name, filter, dialog). Null outside the workbench provider.
 */
export function useProjectIdentity(projectId: string | null | undefined): ResolvedProjectIdentity | null {
  const workbench = useWorkbench();
  if (!workbench || !projectId) return null;
  const customColor = toColorKey(workbench.projectIdentities[projectId]?.color);
  return { color: customColor ?? defaultColorFor(projectId), isCustom: Boolean(customColor) };
}

const SIZE_CLASSES = {
  xs: 'h-1.5 w-1.5',
  sm: 'h-2 w-2',
  md: 'h-2.5 w-2.5',
} as const;

type ProjectDotProps = {
  projectId: string | null | undefined;
  name: string;
  size?: keyof typeof SIZE_CLASSES;
  /** Opens the color picker on click (the click does not reach the row). */
  editable?: boolean;
  className?: string;
};

/**
 * Used by the sidebar project rows and the filter to show a project's color
 * as a small dot; on the project row it is also the handle for changing it.
 */
export default function ProjectDot({ projectId, name, size = 'sm', editable = false, className }: ProjectDotProps) {
  const workbench = useWorkbench();
  const { t } = useTranslation('workbench');
  const identity = useProjectIdentity(projectId);
  if (!identity || !projectId) return null;

  const dot = cn('inline-block flex-shrink-0 rounded-full', SIZE_CLASSES[size], WORKBENCH_PALETTE[identity.color].solid);

  if (!editable || !workbench) {
    return <span className={cn(dot, className)} aria-hidden="true" />;
  }

  const openEditor = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    workbench.openDialog({ kind: 'project-identity', projectId, projectName: name });
  };

  // A larger invisible hit area around the dot, so it is easy to click.
  return (
    <span
      role="button"
      tabIndex={0}
      title={t('projectDot.setColor')}
      className={cn('-m-1 flex flex-shrink-0 cursor-pointer items-center justify-center rounded-full p-1 hover:bg-accent', className)}
      onClick={openEditor}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') openEditor(event as unknown as MouseEvent);
      }}
    >
      <span className={dot} />
    </span>
  );
}

/** The text color classes for a project's name; empty outside the workbench. */
export function useProjectNameClass(projectId: string | null | undefined): string {
  const identity = useProjectIdentity(projectId);
  return identity ? WORKBENCH_PALETTE[identity.color].text : '';
}
