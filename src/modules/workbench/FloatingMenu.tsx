import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/shared/utils';

type Placement = 'right-end' | 'top-start';

/**
 * CozyCLI: a small popover menu anchored to a button, rendered in a portal so a
 * clipped container (the activity bar, the composer) does not cut it off.
 * Closes on Escape and on a click outside the menu and its anchor.
 */
export default function FloatingMenu({
  anchorRef,
  open,
  onClose,
  placement,
  ariaLabel,
  className,
  children,
}: {
  anchorRef: RefObject<HTMLElement>;
  open: boolean;
  onClose: () => void;
  placement: Placement;
  ariaLabel: string;
  className?: string;
  children: ReactNode;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' });

  useLayoutEffect(() => {
    if (!open) return;
    const anchor = anchorRef.current?.getBoundingClientRect();
    if (!anchor) return;
    const gap = 6;
    if (placement === 'right-end') {
      setStyle({
        left: anchor.right + gap,
        bottom: Math.max(8, window.innerHeight - anchor.bottom),
        maxHeight: Math.max(160, anchor.bottom - 8),
      });
    } else {
      setStyle({
        left: Math.max(8, Math.min(anchor.left, window.innerWidth - 328)),
        bottom: window.innerHeight - anchor.top + gap,
        maxHeight: Math.max(160, anchor.top - 16),
      });
    }
  }, [anchorRef, open, placement]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
    };
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [anchorRef, onClose, open]);

  if (!open) return null;
  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={ariaLabel}
      style={style}
      className={cn(
        'fixed z-[200] min-w-48 overflow-y-auto overscroll-contain rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-xl',
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  );
}
