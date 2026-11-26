import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, RotateCcw, SlidersHorizontal } from 'lucide-react';

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
          <h3 className="text-sm font-semibold text-foreground">界面定制</h3>
          <p className="text-xs text-muted-foreground">这些设置保存在服务器上，所有设备同步</p>
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        <Section title="视图导航栏">
          <Row title="使用左侧导航栏" hint="所有视图和插件放到左侧竖栏，顶部不再显示标签栏">
            <Switch checked={settings.activityBar.enabled} label="使用左侧导航栏" onChange={(value) => saveSettings({ activityBar: { enabled: value } })} />
          </Row>
          {settings.activityBar.enabled && (
            <div className="flex items-center justify-between py-1.5 text-xs text-muted-foreground">
              <span>也可以直接在左侧竖栏里拖动图标排序；放不下的收进「⋯」</span>
              {settings.activityBar.order.length > 0 && (
                <button type="button" className="flex items-center gap-1 hover:text-foreground" onClick={() => saveSettings({ activityBar: { order: [] } })}>
                  <RotateCcw className="h-3 w-3" />恢复默认顺序
                </button>
              )}
            </div>
          )}
          {settings.activityBar.enabled && barItems.map((item, index) => (
            <Row key={item.id} title={item.label} hint={item.kind === 'plugin' ? '插件' : undefined}>
              <div className="flex items-center gap-1">
                <button type="button" aria-label={`上移 ${item.label}`} className={iconButton} disabled={index === 0} onClick={() => moveBarItem(item.id, -1)}>
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button type="button" aria-label={`下移 ${item.label}`} className={iconButton} disabled={index === barItems.length - 1} onClick={() => moveBarItem(item.id, 1)}>
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                <span className="ml-1"><Switch checked={!hidden.has(item.id)} label={`显示 ${item.label}`} onChange={(visible) => toggleHidden(item.id, visible)} /></span>
              </div>
            </Row>
          ))}
        </Section>

        <Section title="常用命令" id="quick-commands" sectionRef={scrollToSection}>
          <QuickCommandsSettings />
        </Section>

        <Section title="用量面板">
          <Row title="在侧边栏底部显示用量" hint="每个来源读一个用量插件；以后接 Gemini 等只需添加来源">
            <Switch checked={settings.usageMeter.enabled} label="显示用量面板" onChange={setUsage('enabled')} />
          </Row>
          <UsageSourcesSettings Switch={Switch} />
          <Row title="自动刷新间隔">
            <select
              value={settings.usageMeter.refreshMinutes}
              onChange={(event) => setUsage('refreshMinutes')(Number(event.target.value))}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            >
              {[1, 5, 10, 15, 30].map((minutes) => <option key={minutes} value={minutes}>{minutes} 分钟</option>)}
            </select>
          </Row>
        </Section>

        <Section title="聊天头像">
          <ChatAvatarSettings Switch={Switch} />
        </Section>

        <Section title="界面精简">
          <Row title="隐藏 GitHub Star 徽标"><Switch checked={settings.cleanup.hideGithubStar} label="隐藏 GitHub Star" onChange={setCleanup('hideGithubStar')} /></Row>
          <Row title="隐藏 Report Issue"><Switch checked={settings.cleanup.hideReportIssue} label="隐藏 Report Issue" onChange={setCleanup('hideReportIssue')} /></Row>
          <Row title="隐藏 Community"><Switch checked={settings.cleanup.hideCommunity} label="隐藏 Community" onChange={setCleanup('hideCommunity')} /></Row>
          <Row title="隐藏版本号链接"><Switch checked={settings.cleanup.hideVersionLink} label="隐藏版本号链接" onChange={setCleanup('hideVersionLink')} /></Row>
          <Row title="隐藏分隔线"><Switch checked={settings.cleanup.hideDividers} label="隐藏分隔线" onChange={setCleanup('hideDividers')} /></Row>
        </Section>

        <Section title="会话与项目">
          <div className="space-y-1.5 py-2">
            <label htmlFor="workbench-quick-directory" className="text-sm text-foreground">快捷会话目录</label>
            <Input
              id="workbench-quick-directory"
              value={directoryDraft}
              onChange={(event) => setDirectoryDraft(event.target.value)}
              onBlur={commitDirectory}
              onKeyDown={(event) => { if (event.key === 'Enter') commitDirectory(); }}
            />
            <p className="text-xs text-muted-foreground">第一次使用时自动创建目录和说明文件，并注册为「快捷会话」项目</p>
          </div>
          <Row title="显示「最近活动」绿点" hint="10 分钟内有活动的会话；运行、后台、未读状态始终显示">
            <Switch checked={settings.showRecentDot} label="显示最近活动绿点" onChange={(value) => saveSettings({ showRecentDot: value })} />
          </Row>
          <Row title="打开页面时显示">
            <select
              value={settings.sidebarDefaultMode}
              onChange={(event) => saveSettings({ sidebarDefaultMode: event.target.value })}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="conversations">对话</option>
              <option value="projects">项目</option>
            </select>
          </Row>
          <Row title="新建的项目排在最前" hint="「按最近活动」排序时，把项目目录的创建时间也算作一次活动">
            <Switch checked={settings.newProjectsFirst} label="新建的项目排在最前" onChange={(value) => saveSettings({ newProjectsFirst: value })} />
          </Row>
        </Section>

        <Section title="快捷键">
          <Row title="在当前项目新建会话"><kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-xs">Ctrl/⌘ + Alt + N</kbd></Row>
          <Row title="快捷会话"><kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-xs">Ctrl/⌘ + Alt + K</kbd></Row>
        </Section>
      </div>

      <div className="flex justify-end border-t border-border/60 px-5 py-3">
        <Button size="sm" onClick={onClose}>完成</Button>
      </div>
    </div>
  );
}
