import { useCallback, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from 'react';
import { CornerDownLeft, Settings2, TextCursorInput } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useWorkbench } from '@/modules/workbench/context/WorkbenchContext';
import FloatingMenu from '@/modules/workbench/FloatingMenu';

/**
 * CozyCLI: used by chat's ChatComposer. The composer footer's "common commands"
 * button: a user-defined list (stored in workbench settings, so it follows the
 * user across devices) of texts that are sent straight away — `/compact`,
 * "Continue" — or inserted at the cursor. Shift+click does the other one.
 *
 * The trigger is rendered by the composer (render prop) so it keeps the
 * footer's own button style.
 */
export default function QuickCommandsMenu({
  onRun,
  children,
}: {
  onRun: (text: string, send: boolean) => void;
  children: (trigger: { ref: RefObject<HTMLButtonElement>; open: boolean; toggle: () => void }) => ReactNode;
}) {
  const workbench = useWorkbench();
  const { t } = useTranslation('workbench');
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((value) => !value), []);

  if (!workbench?.isReady) return null;
  const commands = workbench.settings.quickCommands;

  const run = (event: MouseEvent, text: string, send: boolean) => {
    setOpen(false);
    onRun(text, event.shiftKey ? !send : send);
  };

  return (
    <>
      {children({ ref, open, toggle })}
      <FloatingMenu anchorRef={ref} open={open} onClose={close} placement="top-start" ariaLabel={t('quickCommands.title')} className="w-80">
        <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-medium text-muted-foreground">{t('quickCommands.menuHint')}</p>
        {commands.length === 0 && <p className="px-2.5 py-2 text-xs text-muted-foreground">{t('quickCommands.empty')}</p>}
        {commands.map((command) => (
          <button
            key={command.id}
            type="button"
            role="menuitem"
            title={command.text}
            onClick={(event) => run(event, command.text, command.send)}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left hover:bg-accent"
          >
            <span className="min-w-0 flex-1">
              {command.label && <span className="block truncate text-sm">{command.label}</span>}
              {/* The text as a second line only when it says something the label does not. */}
              {command.label.trim() !== command.text.trim() && (
                <span className={command.label ? 'block truncate font-mono text-[11px] text-muted-foreground' : 'block truncate font-mono text-sm'}>
                  {command.text.split('\n')[0]}
                </span>
              )}
            </span>
            {command.send
              ? <CornerDownLeft aria-label={t('quickCommands.sendsNow')} className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
              : <TextCursorInput aria-label={t('quickCommands.inserts')} className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />}
          </button>
        ))}
        <div className="my-1 h-px bg-border" aria-hidden />
        <button
          type="button"
          role="menuitem"
          onClick={() => { setOpen(false); workbench.openDialog({ kind: 'settings', section: 'quick-commands' }); }}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent"
        >
          <Settings2 className="h-3.5 w-3.5" />{t('quickCommands.customize')}
        </button>
      </FloatingMenu>
    </>
  );
}
