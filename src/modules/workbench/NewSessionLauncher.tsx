import { useEffect, useMemo, useRef, useState } from 'react';
import { FolderPlus, Loader2, Search, X, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { api } from '@/shared/api';
import { Button, Input, LLMProviderLogo } from '@/shared/ui';
import { readSelectedProvider, writeSelectedProvider } from '@/shared/selectedProvider';
import { cn } from '@/shared/utils';
import type { LLMProvider, PermissionMode, Project, ProviderModelsDefinition } from '@/shared/types';
import { useWorkbench, useWorkbenchHost } from '@/modules/workbench/context/WorkbenchContext';
import { useProjectNameClass } from '@/modules/workbench/ProjectBadge';
import { workbenchApi } from '@/modules/workbench/utils/workbenchApi';

const PROVIDERS: { id: LLMProvider; label: string }[] = [
  { id: 'claude', label: 'Claude' },
  { id: 'codex', label: 'Codex' },
  { id: 'opencode', label: 'OpenCode' },
  { id: 'cursor', label: 'Cursor' },
];

/** The chat reads these keys when it mounts; see useChatProviderState. */
const modelKey = (provider: LLMProvider) => `${provider}-model`;
const effortKey = (provider: LLMProvider) => `${provider}-effort`;
const permissionKey = (provider: LLMProvider) => `permissionMode-last-${provider}`;

/** Same per-provider modes as the chat's fallback list; capabilities refine it when they load. */
const FALLBACK_PERMISSION_MODES: Record<LLMProvider, PermissionMode[]> = {
  claude: ['default', 'auto', 'acceptEdits', 'bypassPermissions', 'plan'],
  cursor: ['default', 'acceptEdits', 'bypassPermissions', 'plan'],
  codex: ['default', 'acceptEdits', 'bypassPermissions'],
  opencode: ['default', 'acceptEdits', 'bypassPermissions', 'plan'],
};

// Mode labels are `launcher.permission.<mode>` in the workbench namespace.
const PERMISSION_MODES = new Set<PermissionMode>(['default', 'auto', 'acceptEdits', 'bypassPermissions', 'plan']);

/** The launcher always opens on unrestricted mode where the provider allows it. */
const PREFERRED_PERMISSION_MODE: PermissionMode = 'bypassPermissions';

function readStorage(key: string): string {
  try { return localStorage.getItem(key) ?? ''; } catch { return ''; }
}

function writeStorage(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* the chat falls back to its default */ }
}

function lastActivity(project: Project, createdAt: number): number {
  let latest = createdAt;
  for (const session of project.sessions ?? []) {
    const stamp = Date.parse(String(session.lastActivity ?? session.updated_at ?? session.created_at ?? ''));
    if (Number.isFinite(stamp) && stamp > latest) latest = stamp;
  }
  return latest;
}

function ProjectRow({ project, isCurrent, onStart }: { project: Project; isCurrent: boolean; onStart: () => void }) {
  const nameClass = useProjectNameClass(project.projectId);
  const { t } = useTranslation('workbench');
  const count = project.sessionMeta?.total ?? project.sessions?.length ?? 0;
  return (
    <button
      type="button"
      onClick={onStart}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent/60',
        isCurrent && 'bg-accent/40',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-sm font-medium text-foreground', nameClass)}>{project.displayName}</span>
        <span className="block truncate text-xs text-muted-foreground">{project.fullPath}</span>
      </span>
      {isCurrent && <span className="flex-shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{t('launcher.current')}</span>}
      <span className="flex-shrink-0 text-right text-xs tabular-nums text-muted-foreground">{t('launcher.sessionCount', { count })}</span>
    </button>
  );
}

/**
 * Used by the project-workspace main region (desktop) in place of the
 * workspace: pick the agent, model and effort, then the project to start a
 * new chat in — a quick session, an existing project or a new folder.
 */
export default function NewSessionLauncher() {
  const workbench = useWorkbench();
  const { t } = useTranslation('workbench');
  const host = useWorkbenchHost();
  // The provider the new chat will use; written to the shared preference on start.
  const [provider, setProvider] = useState<LLMProvider>(readSelectedProvider);
  // Model catalogs as they arrive; a provider without one is not usable here.
  const [catalogs, setCatalogs] = useState<Partial<Record<LLMProvider, ProviderModelsDefinition>>>({});
  // Chosen model / effort per provider, seeded from what the chat last used.
  const [models, setModels] = useState<Partial<Record<LLMProvider, string>>>({});
  const [efforts, setEfforts] = useState<Partial<Record<LLMProvider, string>>>({});
  // Permission modes each provider accepts (from the capabilities endpoint, else the fallback list).
  const [permissionModes, setPermissionModes] = useState<Record<LLMProvider, PermissionMode[]>>(FALLBACK_PERMISSION_MODES);
  // Chosen permission mode per provider; unset means the preferred (unrestricted) one.
  const [permissions, setPermissions] = useState<Partial<Record<LLMProvider, PermissionMode>>>({});
  // Project search text.
  const [query, setQuery] = useState('');
  // The new-project form; null while collapsed.
  const [newProject, setNewProject] = useState<{ path: string; name: string } | null>(null);
  // An action in flight (quick session or creating a project), and its error.
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    for (const { id } of PROVIDERS) {
      void (async () => {
        try {
          const response = await api.providers.models(id);
          const body = await response.json() as { success?: boolean; data?: { models?: ProviderModelsDefinition } };
          const definition = body.success ? body.data?.models : undefined;
          if (!definition || cancelled) return;
          setCatalogs((previous) => ({ ...previous, [id]: definition }));
          const stored = readStorage(modelKey(id));
          const model = definition.OPTIONS.some((option) => option.value === stored) ? stored : definition.DEFAULT;
          setModels((previous) => ({ ...previous, [id]: previous[id] ?? model }));
          setEfforts((previous) => ({ ...previous, [id]: previous[id] ?? readStorage(effortKey(id)) }));
        } catch {
          // A provider that cannot list models stays unselectable.
        }
      })();
    }
    void (async () => {
      try {
        const response = await api.providers.capabilities();
        const body = await response.json() as { success?: boolean; data?: { providers?: { provider: LLMProvider; permissionModes?: string[] }[] } };
        if (cancelled || !body.success || !Array.isArray(body.data?.providers)) return;
        const next = { ...FALLBACK_PERMISSION_MODES };
        for (const entry of body.data.providers) {
          if (entry.permissionModes?.length) next[entry.provider] = entry.permissionModes as PermissionMode[];
        }
        setPermissionModes(next);
      } catch {
        // The fallback list stays.
      }
    })();
    searchRef.current?.focus();
    return () => { cancelled = true; };
  }, []);

  const projects = host?.projects;
  const createdAt = workbench?.projectCreatedAt;
  const quickDirectory = workbench?.settings.quickSession.directory ?? '';
  const sortedProjects = useMemo(() => {
    const needle = query.trim().toLowerCase();
    // The quick-session folder already has its own row at the top.
    const quickSuffix = quickDirectory.replace(/^~/, '').replace(/\/+$/, '');
    return [...(projects ?? [])]
      .filter((project) => !(quickSuffix && project.fullPath.endsWith(quickSuffix)))
      .filter((project) => !needle
        || project.displayName.toLowerCase().includes(needle)
        || project.fullPath.toLowerCase().includes(needle))
      .sort((a, b) => lastActivity(b, createdAt?.[b.projectId] ?? 0) - lastActivity(a, createdAt?.[a.projectId] ?? 0));
  }, [createdAt, projects, query, quickDirectory]);

  if (!workbench || !host) return null;

  const catalog = catalogs[provider];
  const model = models[provider] ?? catalog?.DEFAULT ?? '';
  const effortValues = catalog?.OPTIONS.find((option) => option.value === model)?.effort?.values ?? [];
  const effort = efforts[provider] && effortValues.some((value) => value.value === efforts[provider])
    ? efforts[provider]!
    : catalog?.OPTIONS.find((option) => option.value === model)?.effort?.default ?? effortValues[0]?.value ?? '';
  const currentProjectId = host.selectedProject?.projectId ?? null;
  const modes = permissionModes[provider] ?? ['default'];
  const permission = permissions[provider] && modes.includes(permissions[provider]!)
    ? permissions[provider]!
    : modes.includes(PREFERRED_PERMISSION_MODE) ? PREFERRED_PERMISSION_MODE : modes[0];

  /** Saves the agent choice where the chat reads it when it mounts. */
  const applyAgentChoice = () => {
    writeSelectedProvider(provider);
    if (model) writeStorage(modelKey(provider), model);
    if (effort) writeStorage(effortKey(provider), effort);
    // A brand-new chat has no session key yet, so it takes the provider's last mode.
    writeStorage(permissionKey(provider), permission);
  };

  const start = (project: Pick<Project, 'projectId'> & Partial<Project>) => {
    applyAgentChoice();
    workbench.startSessionInProject(project);
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  const startQuick = () => run(async () => {
    const { project } = await workbenchApi.ensureQuickSessionProject();
    start(project);
  });

  const createAndStart = () => run(async () => {
    if (!newProject?.path.trim()) return;
    const { project } = await workbenchApi.createProject(newProject.path.trim(), newProject.name.trim() || null);
    start(project);
  });

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-2xl px-6 py-8">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold text-foreground">{t('launcher.title')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t('launcher.subtitle')}</p>
          </div>
          {host.selectedProject && (
            <button
              type="button"
              aria-label={t('common.close')}
              onClick={workbench.closeLauncher}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <section className="mb-6 rounded-xl border border-border/60 p-4">
          <div className="grid grid-cols-4 gap-2">
            {PROVIDERS.map(({ id, label }) => {
              const available = Boolean(catalogs[id]);
              return (
                <button
                  key={id}
                  type="button"
                  disabled={!available}
                  onClick={() => setProvider(id)}
                  className={cn(
                    'flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors disabled:opacity-40',
                    provider === id ? 'border-primary bg-primary/10 text-foreground' : 'border-border/60 text-muted-foreground hover:bg-accent/50',
                  )}
                >
                  <LLMProviderLogo provider={id} className="h-4 w-4" />
                  {label}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex gap-2">
            <select
              aria-label={t('launcher.model')}
              value={model}
              disabled={!catalog}
              onChange={(event) => setModels((previous) => ({ ...previous, [provider]: event.target.value }))}
              className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"
            >
              {(catalog?.OPTIONS ?? []).map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            {effortValues.length > 0 && (
              <select
                aria-label={t('launcher.effort')}
                value={effort}
                onChange={(event) => setEfforts((previous) => ({ ...previous, [provider]: event.target.value }))}
                className="h-9 w-36 rounded-md border border-input bg-background px-2 text-sm"
              >
                {effortValues.map((value) => <option key={value.value} value={value.value}>{value.value}</option>)}
              </select>
            )}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="w-16 flex-shrink-0 text-xs text-muted-foreground">{t('launcher.permissionMode')}</span>
            <div className="flex flex-wrap gap-1">
              {modes.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setPermissions((previous) => ({ ...previous, [provider]: mode }))}
                  className={cn(
                    'rounded-md border px-2 py-1 text-xs transition-colors',
                    permission === mode
                      ? mode === 'bypassPermissions'
                        ? 'border-amber-500/60 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                        : 'border-primary bg-primary/10 text-foreground'
                      : 'border-border/60 text-muted-foreground hover:bg-accent/50',
                  )}
                >
                  {PERMISSION_MODES.has(mode) ? t(`launcher.permission.${mode}`) : mode}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border/60">
          <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
            <Search className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && sortedProjects[0]) start(sortedProjects[0]);
                if (event.key === 'Escape' && host.selectedProject) workbench.closeLauncher();
              }}
              placeholder={t('launcher.search')}
              className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <div className="p-1.5">
            {!query && (
              <button
                type="button"
                disabled={busy}
                onClick={() => { void startQuick(); }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-accent/60"
              >
                {busy && !newProject ? <Loader2 className="h-4 w-4 animate-spin text-amber-500" /> : <Zap className="h-4 w-4 text-amber-500" />}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground">{t('launcher.quickTitle')}</span>
                  <span className="block truncate text-xs text-muted-foreground">{t('launcher.quickHint', { dir: workbench.settings.quickSession.directory })}</span>
                </span>
              </button>
            )}

            <div className="max-h-[45vh] overflow-y-auto">
              {sortedProjects.map((project) => (
                <ProjectRow
                  key={project.projectId}
                  project={project}
                  isCurrent={project.projectId === currentProjectId}
                  onStart={() => start(project)}
                />
              ))}
              {sortedProjects.length === 0 && (
                <p className="px-3 py-4 text-center text-sm text-muted-foreground">{t('launcher.noMatch')}</p>
              )}
            </div>

            {newProject ? (
              <div className="space-y-2 border-t border-border/60 p-2">
                <Input
                  autoFocus
                  placeholder={t('launcher.dirPlaceholder')}
                  value={newProject.path}
                  onChange={(event) => setNewProject({ ...newProject, path: event.target.value })}
                  onKeyDown={(event) => { if (event.key === 'Enter') void createAndStart(); }}
                />
                <Input
                  placeholder={t('launcher.namePlaceholder')}
                  value={newProject.name}
                  onChange={(event) => setNewProject({ ...newProject, name: event.target.value })}
                  onKeyDown={(event) => { if (event.key === 'Enter') void createAndStart(); }}
                />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setNewProject(null)}>{t('common.cancel')}</Button>
                  <Button size="sm" disabled={busy || !newProject.path.trim()} onClick={() => { void createAndStart(); }}>
                    {busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}{t('launcher.createStart')}
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setNewProject({ path: '~/projects/', name: '' })}
                className="mt-1 flex w-full items-center gap-3 rounded-lg border-t border-border/60 px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              >
                <FolderPlus className="h-4 w-4" />{t('launcher.newProject')}
              </button>
            )}
            {error && <p className="px-3 pb-2 text-xs text-red-500">{error}</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
