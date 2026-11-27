import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button, Input } from '@/shared/ui';
import { cn } from '@/shared/utils';
import { useWorkbench } from '@/modules/workbench/context/WorkbenchContext';
import { useOrderedActivityBarItems } from '@/modules/workbench/hooks/useActivityBarItems';
import { shiftItem } from '@/modules/workbench/utils/activityBarOrder';
import QuickCommandsSettings from '@/modules/workbench/modals/QuickCommandsSettings';
import ChatAvatarSettings from '@/modules/workbench/modals/ChatAvatarSettings';
import UsageSourcesSettings from '@/modules/workbench/modals/UsageSourcesSettings';

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors',
        checked ? 'bg-primary' : 'bg-muted-foreground/30',
      )}
    >
      <span className={cn(
        'inline-block h-4 w-4 rounded-full bg-background shadow transition-transform',
        checked ? 'translate-x-[18px]' : 'translate-x-0.5',
      )} />
    </button>
  );
}

function Row({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <div className="min-w-0">
        <p className="text-sm text-foreground">{title}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Section({ title, children, id, sectionRef }: { title: string; children: ReactNode; id?: string; sectionRef?: (element: HTMLElement | null) => void }) {
  return (
    <section className="space-y-1" data-section={id} ref={sectionRef}>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      <div className="divide-y divide-border/50 rounded-lg border border-border/60 px-3">{children}</div>
    </section>
  );
}

/** Rendered by WorkbenchDialogs for every workbench setting; all of them are stored server-side. */
export default function WorkbenchSettingsDialog({ onClose, section }: { onClose: () => void; section?: string }) {
  const workbench = useWorkbench();
  const { t } = useTranslation('workbench');
  const { all: barItems } = useOrderedActivityBarItems(
    workbench?.settings.activityBar.order ?? [],
    workbench?.settings.activityBar.hiddenItems ?? [],
  );
  // Opened from a feature's own "customise" link: scroll to its section once.
  const scrollToSection = (element: HTMLElement | null) => {
    if (element && section && element.dataset.section === section) element.scrollIntoView({ block: 'start' });
  };
  // The quick-session folder as typed; saved on blur or Enter so each keystroke is not a request.
  const [directoryDraft, setDirectoryDraft] = useState(workbench?.settings.quickSession.directory ?? '');

  if (!workbench) return null;
  const { settings, saveSettings } = workbench;
  const hidden = new Set(settings.activityBar.hiddenItems);

  const setCleanup = (key: keyof typeof settings.cleanup) => (value: boolean) => saveSettings({ cleanup: { [key]: value } });
  const setUsage = (key: 'enabled' | 'refreshMinutes') => (value: boolean | number) => saveSettings({ usageMeter: { [key]: value } });
  const toggleHidden = (id: string, visible: boolean) => {
    const next = visible ? [...hidden].filter((item) => item !== id) : [...hidden, id];
    saveSettings({ activityBar: { hiddenItems: next } });
  };
  const moveBarItem = (id: string, delta: -1 | 1) => {
    saveSettings({ activityBar: { order: shiftItem(barItems.map((item) => item.id as string), id, delta) } });
  };
  const iconButton = 'flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent';
  const commitDirectory = () => {
    const value = directoryDraft.trim();
    if (value && value !== settings.quickSession.directory) saveSettings({ quickSession: { directory: value } });
  };

  return (
    <div className="flex max-h-[80vh] flex-col">
      <div className="flex items-center gap-3 border-b border-border/60 px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">{t('settings.title')}</h3>
          <p className="text-xs text-muted-foreground">{t('settings.subtitle')}</p>
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        <Section title={t('settings.activityBar.section')}>
          <Row title={t('settings.activityBar.use')} hint={t('settings.activityBar.useHint')}>
            <Switch checked={settings.activityBar.enabled} label={t('settings.activityBar.use')} onChange={(value) => saveSettings({ activityBar: { enabled: value } })} />
          </Row>
          {settings.activityBar.enabled && (
            <div className="flex items-center justify-between py-1.5 text-xs text-muted-foreground">
              <span>{t('settings.activityBar.dragHint')}</span>
              {settings.activityBar.order.length > 0 && (
                <button type="button" className="flex flex-shrink-0 items-center gap-1 whitespace-nowrap hover:text-foreground" onClick={() => saveSettings({ activityBar: { order: [] } })}>
                  <RotateCcw className="h-3 w-3" />{t('settings.activityBar.resetOrder')}
                </button>
              )}
            </div>
          )}
          {settings.activityBar.enabled && barItems.map((item, index) => (
            <Row key={item.id} title={item.label} hint={item.kind === 'plugin' ? t('settings.activityBar.plugin') : undefined}>
              <div className="flex items-center gap-1">
                <button type="button" aria-label={t('settings.activityBar.moveUp', { name: item.label })} className={iconButton} disabled={index === 0} onClick={() => moveBarItem(item.id, -1)}>
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button type="button" aria-label={t('settings.activityBar.moveDown', { name: item.label })} className={iconButton} disabled={index === barItems.length - 1} onClick={() => moveBarItem(item.id, 1)}>
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                <span className="ml-1"><Switch checked={!hidden.has(item.id)} label={t('settings.activityBar.show', { name: item.label })} onChange={(visible) => toggleHidden(item.id, visible)} /></span>
              </div>
            </Row>
          ))}
        </Section>

        <Section title={t('quickCommands.title')} id="quick-commands" sectionRef={scrollToSection}>
          <QuickCommandsSettings />
        </Section>

        <Section title={t('settings.usage.section')}>
          <Row title={t('settings.usage.show')} hint={t('settings.usage.showHint')}>
            <Switch checked={settings.usageMeter.enabled} label={t('settings.usage.showAria')} onChange={setUsage('enabled')} />
          </Row>
          <UsageSourcesSettings Switch={Switch} />
          <Row title={t('settings.usage.refresh')}>
            <select
              value={settings.usageMeter.refreshMinutes}
              onChange={(event) => setUsage('refreshMinutes')(Number(event.target.value))}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            >
              {[1, 5, 10, 15, 30].map((minutes) => <option key={minutes} value={minutes}>{t('settings.usage.minutes', { count: minutes })}</option>)}
            </select>
          </Row>
        </Section>

        <Section title={t('settings.avatars.section')}>
          <ChatAvatarSettings Switch={Switch} />
        </Section>

        <Section title={t('settings.cleanup.section')}>
          <Row title={t('settings.cleanup.star')}><Switch checked={settings.cleanup.hideGithubStar} label={t('settings.cleanup.star')} onChange={setCleanup('hideGithubStar')} /></Row>
          <Row title={t('settings.cleanup.issue')}><Switch checked={settings.cleanup.hideReportIssue} label={t('settings.cleanup.issue')} onChange={setCleanup('hideReportIssue')} /></Row>
          <Row title={t('settings.cleanup.community')}><Switch checked={settings.cleanup.hideCommunity} label={t('settings.cleanup.community')} onChange={setCleanup('hideCommunity')} /></Row>
          <Row title={t('settings.cleanup.version')}><Switch checked={settings.cleanup.hideVersionLink} label={t('settings.cleanup.version')} onChange={setCleanup('hideVersionLink')} /></Row>
          <Row title={t('settings.cleanup.dividers')}><Switch checked={settings.cleanup.hideDividers} label={t('settings.cleanup.dividers')} onChange={setCleanup('hideDividers')} /></Row>
        </Section>

        <Section title={t('settings.sessions.section')}>
          <div className="space-y-1.5 py-2">
            <label htmlFor="workbench-quick-directory" className="text-sm text-foreground">{t('settings.sessions.quickDir')}</label>
            <Input
              id="workbench-quick-directory"
              value={directoryDraft}
              onChange={(event) => setDirectoryDraft(event.target.value)}
              onBlur={commitDirectory}
              onKeyDown={(event) => { if (event.key === 'Enter') commitDirectory(); }}
            />
            <p className="text-xs text-muted-foreground">{t('settings.sessions.quickDirHint')}</p>
          </div>
          <Row title={t('settings.sessions.recentDot')} hint={t('settings.sessions.recentDotHint')}>
            <Switch checked={settings.showRecentDot} label={t('settings.sessions.recentDot')} onChange={(value) => saveSettings({ showRecentDot: value })} />
          </Row>
          <Row title={t('settings.sessions.openOn')}>
            <select
              value={settings.sidebarDefaultMode}
              onChange={(event) => saveSettings({ sidebarDefaultMode: event.target.value })}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="conversations">{t('settings.sessions.conversations')}</option>
              <option value="projects">{t('settings.sessions.projects')}</option>
            </select>
          </Row>
          <Row title={t('settings.sessions.newFirst')} hint={t('settings.sessions.newFirstHint')}>
            <Switch checked={settings.newProjectsFirst} label={t('settings.sessions.newFirst')} onChange={(value) => saveSettings({ newProjectsFirst: value })} />
          </Row>
        </Section>

        <Section title={t('settings.shortcuts.section')}>
          <Row title={t('settings.shortcuts.newHere')}><kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-xs">Ctrl/⌘ + Alt + N</kbd></Row>
          <Row title={t('settings.shortcuts.quick')}><kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-xs">Ctrl/⌘ + Alt + K</kbd></Row>
        </Section>
      </div>

      <div className="flex justify-end border-t border-border/60 px-5 py-3">
        <Button size="sm" onClick={onClose}>{t('common.done')}</Button>
      </div>
    </div>
  );
}
