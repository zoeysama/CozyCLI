import { cn } from '@/shared/utils';
import { useWorkbench } from '@/modules/workbench/context/WorkbenchContext';
import { WORKBENCH_PALETTE, toColorKey } from '@/modules/workbench/utils/workbenchPalette';

const NEUTRAL_CHIP = 'bg-muted text-muted-foreground';

/** The classes for one tag chip; shared by the row chips, the filter and the tag dialog. */
export function tagChipClass(color: string | null | undefined): string {
  const key = toColorKey(color);
  return key ? WORKBENCH_PALETTE[key].soft : NEUTRAL_CHIP;
}

/**
 * Used by the sidebar session rows and recents rows to show a session's
 * manual tags; the first `max` are shown and the rest collapse into `+N`.
 */
export default function SessionTagChips({ sessionId, max = 2, className }: { sessionId: string; max?: number; className?: string }) {
  const workbench = useWorkbench();
  const tags = workbench?.sessionTags[sessionId];
  if (!workbench || !tags || tags.length === 0) return null;

  const shown = tags.slice(0, max);
  const hiddenCount = tags.length - shown.length;
  return (
    <span className={cn('flex flex-shrink-0 items-center gap-1', className)} title={tags.join('、')}>
      {shown.map((tag) => (
        <span
          key={tag}
          className={cn('max-w-[6rem] flex-shrink-0 truncate rounded px-1.5 py-px text-[10px] leading-3', tagChipClass(workbench.tagColors.get(tag)))}
        >
          {tag}
        </span>
      ))}
      {hiddenCount > 0 && <span className="flex-shrink-0 text-[10px] leading-3 text-muted-foreground">+{hiddenCount}</span>}
    </span>
  );
}
