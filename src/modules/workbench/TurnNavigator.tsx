import type { RefObject } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Tooltip } from '@/shared/ui';

/** Class the transcript puts on each user message row: the start of a turn. */
export const TURN_START_CLASS = 'cozy-turn-start';

/** Keeps the target clear of the transcript's sticky toolbar. */
const TOP_CLEARANCE_PX = 56;

/** Turn-start offsets inside the scroll container, top to bottom. */
function turnOffsets(container: HTMLElement): number[] {
  const containerTop = container.getBoundingClientRect().top;
  return Array.from(container.querySelectorAll<HTMLElement>(`.${TURN_START_CLASS}`))
    .map((element) => element.getBoundingClientRect().top - containerTop + container.scrollTop)
    .sort((a, b) => a - b);
}

/**
 * Used by the chat transcript: two buttons by the scrollbar that jump to the
 * previous / next turn start (a user message). Rows not yet rendered still
 * carry the marker, so jumps work across the whole loaded transcript; past
 * the first turn, "previous" scrolls to the very top, which is also what loads
 * older messages.
 */
export default function TurnNavigator({ scrollContainerRef }: { scrollContainerRef: RefObject<HTMLDivElement> }) {
  const { t } = useTranslation('workbench');
  const jump = (direction: -1 | 1) => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const position = container.scrollTop + TOP_CLEARANCE_PX;
    const offsets = turnOffsets(container);
    let target: number;
    if (direction < 0) {
      const previous = offsets.filter((offset) => offset < position - 4);
      target = previous.length ? previous[previous.length - 1] - TOP_CLEARANCE_PX : 0;
    } else {
      const next = offsets.find((offset) => offset > position + 4);
      target = next !== undefined ? next - TOP_CLEARANCE_PX : container.scrollHeight;
    }
    container.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
  };

  const buttonClass = 'flex h-7 w-7 items-center justify-center rounded-full border border-border/70 bg-background/90 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:bg-accent hover:text-foreground';

  return (
    <div className="pointer-events-none sticky top-[42%] z-20 h-0">
      <div className="pointer-events-auto absolute right-1.5 flex flex-col gap-1.5">
        <Tooltip content={t('turnNav.prev')} position="left">
          <button type="button" aria-label={t('turnNav.prevAria')} className={buttonClass} onClick={() => jump(-1)}>
            <ChevronUp className="h-4 w-4" />
          </button>
        </Tooltip>
        <Tooltip content={t('turnNav.next')} position="left">
          <button type="button" aria-label={t('turnNav.nextAria')} className={buttonClass} onClick={() => jump(1)}>
            <ChevronDown className="h-4 w-4" />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
