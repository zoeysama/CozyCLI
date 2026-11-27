import i18next from 'i18next';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { AppTab, Project, ProjectSession } from '@/shared/types';
import { usePlugins } from '@/modules/plugins';
import { workbenchApi, type LiveSessionStatus, type WorkbenchStatePayload } from '@/modules/workbench/utils/workbenchApi';
import {
  resolveWorkbenchSettings,
  type WorkbenchSettings,
} from '@/modules/workbench/utils/workbenchSettings';
import WorkbenchDialogs, { type WorkbenchDialogState } from '@/modules/workbench/modals/WorkbenchDialogs';

/**
 * CozyCLI: the fork's workbench state — project identities, session tags, the
 * sidebar label filter and the workbench settings — plus the actions the
 * quick-session buttons, activity bar and dialogs use.
 *
 * Two contexts on purpose. The data context changes only when the user edits
 * labels or settings, so the hundreds of session rows that read it do not
 * re-render on every websocket frame. The host context carries the project
 * workspace's live state (active tab, selected project) and is read only by
 * the activity bar.
 */

/** What the project workspace hands the workbench; see WorkbenchHostBridge. */
export type WorkbenchHost = {
  projects: Project[];
  selectedProject: Project | null;
  selectedSession: ProjectSession | null;
  onNewSession: (project: Project) => void;
  refreshProjects: () => void | Promise<void>;
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  onShowSettings: () => void;
  isMobile: boolean;
};

/** Which sessions the status view lists. */
export type StatusFilter = 'active' | 'unread' | 'flagged' | 'all';

/** The sidebar filter: a session must carry any selected tag and belong to any selected project. */
export type WorkbenchFilter = { tags: string[]; projectIds: string[] };

type WorkbenchData = {
  isReady: boolean;
  settings: WorkbenchSettings;
  projectIdentities: WorkbenchStatePayload['projectIdentities'];
  tagColors: ReadonlyMap<string, string | null>;
  sessionTags: WorkbenchStatePayload['sessionTags'];
  projectCreatedAt: WorkbenchStatePayload['projectCreatedAt'];
  filter: WorkbenchFilter;
  setFilter: (filter: WorkbenchFilter) => void;
  saveSettings: (patch: Record<string, unknown>) => void;
  setProjectIdentity: (projectId: string, identity: { color: string | null; badge: string | null }) => void;
  setSessionTags: (sessionId: string, tags: string[]) => void;
  setTagColor: (name: string, color: string | null) => void;
  deleteTag: (name: string) => void;
  openDialog: (dialog: WorkbenchDialogState) => void;
  startSessionInCurrentProject: () => void;
  startQuickSession: () => Promise<void>;
  isStartingQuickSession: boolean;
  /** Uploaded chat avatar images (data URLs) by avatar key. */
  avatarImages: Readonly<Record<string, string>>;
  setAvatarImage: (key: string, dataUrl: string | null) => Promise<void>;
  /** When the user last looked at each session (ms), across devices. */
  sessionViews: Readonly<Record<string, number>>;
  /** The new-session launcher in the main area: open explicitly, or shown when no project is selected. */
  isLauncherOpen: boolean;
  closeLauncher: () => void;
  /** The status view's tab; a per-device convenience. */
  statusFilter: StatusFilter;
  setStatusFilter: (filter: StatusFilter) => void;
  /** Starts a new chat in a project and closes the launcher. */
  startSessionInProject: (project: Pick<Project, 'projectId'> & Partial<Project>) => void;
};

const WorkbenchDataContext = createContext<WorkbenchData | null>(null);
const WorkbenchHostContext = createContext<WorkbenchHost | null>(null);
/** Latest known activity (ms) per session id, from the live project list; see useSessionActivity. */
const SessionActivityContext = createContext<ReadonlyMap<string, number> | null>(null);
/** Live state and alarms per session from the server's disk reads; see useLiveSessionStatus. */
const LiveStatusContext = createContext<Readonly<Record<string, LiveSessionStatus>>>({});
const LIVE_STATUS_INTERVAL_MS = 15_000;

function sessionStamp(session: ProjectSession): number {
  const stamp = Date.parse(String(session.lastActivity ?? session.updated_at ?? session.created_at ?? ''));
  return Number.isFinite(stamp) ? stamp : 0;
}

const FILTER_STORAGE_KEY = 'workbench-sidebar-filter';
const STATUS_FILTER_STORAGE_KEY = 'workbench-status-filter';
const STATUS_FILTERS: StatusFilter[] = ['active', 'unread', 'flagged', 'all'];
const REFRESH_INTERVAL_MS = 60_000;
const STYLE_ELEMENT_ID = 'workbench-styles';

const EMPTY_STATE: WorkbenchStatePayload = {
  settings: {},
  projectIdentities: {},
  tags: [],
  sessionTags: {},
  projectCreatedAt: {},
  sessionViews: {},
};

function readStoredFilter(): WorkbenchFilter {
  try {
    const parsed = JSON.parse(localStorage.getItem(FILTER_STORAGE_KEY) || '{}') as Partial<WorkbenchFilter>;
    return {
      tags: Array.isArray(parsed.tags) ? parsed.tags.filter((tag) => typeof tag === 'string') : [],
      projectIds: Array.isArray(parsed.projectIds) ? parsed.projectIds.filter((id) => typeof id === 'string') : [],
    };
  } catch {
    return { tags: [], projectIds: [] };
  }
}

/** Latest activity of a project from its loaded sessions, used to pick a fallback target project. */
function lastActivityOf(project: Project): number {
  let latest = 0;
  for (const session of project.sessions ?? []) {
    const stamp = Date.parse(String(session.lastActivity ?? session.updated_at ?? session.created_at ?? ''));
    if (Number.isFinite(stamp) && stamp > latest) latest = stamp;
  }
  return latest;
}

/** Used by the project-workspace module (through WorkbenchHostBridge) to wrap the workspace shell. */
export function WorkbenchProvider({ host, children }: { host: WorkbenchHost; children: ReactNode }) {
  // The server copy of everything the workbench shows; replaced on each fetch and patched optimistically on edits.
  const [state, setState] = useState<WorkbenchStatePayload>(EMPTY_STATE);
  // False until the first fetch lands, so settings-driven layout (the activity bar) does not flash.
  const [isReady, setIsReady] = useState(false);
  // The sidebar filter is a per-device convenience, so it lives in localStorage, not on the server.
  const [filter, setFilterState] = useState<WorkbenchFilter>(readStoredFilter);
  // The one dialog currently open (project identity, session tags or settings), or null.
  const [dialog, setDialog] = useState<WorkbenchDialogState>(null);
  // Chat avatar images; fetched separately from the state because they are the only bulky data.
  const [avatarImages, setAvatarImages] = useState<Record<string, string>>({});
  // The status view's tab, remembered on this device.
  const [statusFilter, setStatusFilterState] = useState<StatusFilter>(() => {
    try {
      const stored = localStorage.getItem(STATUS_FILTER_STORAGE_KEY) as StatusFilter | null;
      return stored && STATUS_FILTERS.includes(stored) ? stored : 'flagged';
    } catch {
      return 'flagged';
    }
  });
  const setStatusFilter = useCallback((filter: StatusFilter) => {
    setStatusFilterState(filter);
    try { localStorage.setItem(STATUS_FILTER_STORAGE_KEY, filter); } catch { /* per-tab only */ }
  }, []);
  // Whether the new-session launcher replaces the workspace (desktop).
  const [isLauncherOpen, setIsLauncherOpen] = useState(false);
  // Disables the quick-session button while the folder and project are being ensured.
  const [isStartingQuickSession, setIsStartingQuickSession] = useState(false);

  // Read inside stable callbacks so actions never go stale and never change identity.
  const hostRef = useRef(host);
  hostRef.current = host;

  const reload = useCallback(async () => {
    try {
      const next = await workbenchApi.getState();
      setState(next);
    } catch (error) {
      console.warn('[workbench] failed to load state', error);
    } finally {
      setIsReady(true);
    }
  }, []);

  // The app-root plugin list is fetched once at page load, which is before the
  // login on a fresh visit, so it would stay empty until a reload. The
  // workspace only mounts once signed in, so fetching again here fixes that.
  const { refreshPlugins } = usePlugins();
  useEffect(() => {
    void refreshPlugins();
  }, [refreshPlugins]);

  const reloadAvatars = useCallback(async () => {
    try {
      const { avatars } = await workbenchApi.listAvatars();
      setAvatarImages(Object.fromEntries(Object.entries(avatars).map(([key, value]) => [key, value.dataUrl])));
    } catch (error) {
      console.warn('[workbench] failed to load avatars', error);
    }
  }, []);

  useEffect(() => {
    void reloadAvatars();
    const onFocus = () => { void reloadAvatars(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [reloadAvatars]);

  const setAvatarImage = useCallback(async (key: string, dataUrl: string | null) => {
    setAvatarImages((current) => {
      const next = { ...current };
      if (dataUrl === null) delete next[key];
      else next[key] = dataUrl;
      return next;
    });
    try {
      await workbenchApi.setAvatar(key, dataUrl);
    } catch (error) {
      void reloadAvatars();
      throw error;
    }
  }, [reloadAvatars]);

  // Running/background/alarm state of every session, including ones another process owns.
  const [liveStatus, setLiveStatus] = useState<Record<string, LiveSessionStatus>>({});
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { sessions } = await workbenchApi.getSessionStatus();
        if (!cancelled) setLiveStatus(sessions);
      } catch {
        // keep the last known status
      }
    };
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, LIVE_STATUS_INTERVAL_MS);
    const onFocus = () => { void load(); };
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const markViewed = useCallback((sessionId: string) => {
    setState((previous) => ({ ...previous, sessionViews: { ...previous.sessionViews, [sessionId]: Date.now() } }));
    workbenchApi.markSessionViewed(sessionId).catch((error: unknown) => {
      console.warn('[workbench] failed to mark a session viewed', error);
    });
  }, []);

  // Live activity per session from the project list (websocket-patched),
  // which is fresher than the Conversations list's one-time fetch.
  const sessionActivity = useMemo(() => {
    const map = new Map<string, number>();
    for (const project of host.projects) {
      for (const session of project.sessions ?? []) map.set(String(session.id), sessionStamp(session));
    }
    return map;
  }, [host.projects]);

  // The open session is read: mark it when it is opened, again (debounced)
  // whenever it gets new activity while open, and once more when it is left.
  const viewedSessionId = host.selectedSession ? String(host.selectedSession.id) : null;
  const viewedSessionActivity = viewedSessionId ? sessionActivity.get(viewedSessionId) ?? 0 : 0;
  useEffect(() => {
    if (!viewedSessionId || !isReady) return undefined;
    const timer = window.setTimeout(() => markViewed(viewedSessionId), 1500);
    return () => window.clearTimeout(timer);
  }, [isReady, markViewed, viewedSessionActivity, viewedSessionId]);
  useEffect(() => {
    if (!viewedSessionId) return undefined;
    markViewed(viewedSessionId);
    return () => markViewed(viewedSessionId);
  }, [markViewed, viewedSessionId]);

  useEffect(() => {
    void reload();
    // Edits made on another device show up on focus or within a minute.
    const onFocus = () => { void reload(); };
    window.addEventListener('focus', onFocus);
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void reload();
    }, REFRESH_INTERVAL_MS);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.clearInterval(timer);
    };
  }, [reload]);

  const settings = useMemo(() => resolveWorkbenchSettings(state.settings), [state.settings]);

  // A project created a moment ago has no folder time yet, so it would sit at
  // the bottom of the date sort until the next periodic refresh. Refetch as
  // soon as the project list shows an id the server has not reported. Each id
  // is asked about once, so a project whose folder is gone cannot loop.
  const askedProjectIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!isReady) return;
    const unseen = host.projects
      .map((project) => project.projectId)
      .filter((projectId) => !(projectId in state.projectCreatedAt) && !askedProjectIdsRef.current.has(projectId));
    if (unseen.length === 0) return;
    unseen.forEach((projectId) => askedProjectIdsRef.current.add(projectId));
    void reload();
  }, [host.projects, isReady, reload, state.projectCreatedAt]);

  // Dividers are upstream markup in several components; one class on <html>
  // hides them all without touching each one.
  useEffect(() => {
    if (!document.getElementById(STYLE_ELEMENT_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ELEMENT_ID;
      style.textContent = '.workbench-hide-dividers .nav-divider { display: none !important; }';
      document.head.appendChild(style);
    }
    document.documentElement.classList.toggle('workbench-hide-dividers', isReady && settings.cleanup.hideDividers);
  }, [isReady, settings.cleanup.hideDividers]);

  const setFilter = useCallback((next: WorkbenchFilter) => {
    setFilterState(next);
    try {
      localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage may be unavailable (private mode); the filter still works for this tab.
    }
  }, []);

  /** Applies an optimistic patch, sends the request, and resyncs from the server if it fails. */
  const mutate = useCallback((apply: (previous: WorkbenchStatePayload) => WorkbenchStatePayload, request: () => Promise<unknown>) => {
    setState(apply);
    request().catch((error: unknown) => {
      console.warn('[workbench] save failed, reloading', error);
      void reload();
    });
  }, [reload]);

  const saveSettings = useCallback((patch: Record<string, unknown>) => {
    mutate(
      (previous) => ({ ...previous, settings: mergePatch(previous.settings, patch) }),
      () => workbenchApi.saveSettings(patch),
    );
  }, [mutate]);

  const setProjectIdentity = useCallback((projectId: string, identity: { color: string | null; badge: string | null }) => {
    mutate((previous) => {
      const projectIdentities = { ...previous.projectIdentities };
      if (identity.color === null && identity.badge === null) delete projectIdentities[projectId];
      else projectIdentities[projectId] = identity;
      return { ...previous, projectIdentities };
    }, () => workbenchApi.setProjectIdentity(projectId, identity));
  }, [mutate]);

  const setSessionTags = useCallback((sessionId: string, tags: string[]) => {
    mutate((previous) => {
      const sessionTags = { ...previous.sessionTags };
      if (tags.length === 0) delete sessionTags[sessionId];
      else sessionTags[sessionId] = tags;
      const known = new Set(previous.tags.map((tag) => tag.name));
      const added = tags.filter((tag) => !known.has(tag)).map((name) => ({ name, color: null }));
      return { ...previous, sessionTags, tags: [...previous.tags, ...added] };
    }, () => workbenchApi.setSessionTags(sessionId, tags));
  }, [mutate]);

  const setTagColor = useCallback((name: string, color: string | null) => {
    mutate((previous) => ({
      ...previous,
      tags: previous.tags.some((tag) => tag.name === name)
        ? previous.tags.map((tag) => (tag.name === name ? { ...tag, color } : tag))
        : [...previous.tags, { name, color }],
    }), () => workbenchApi.updateTag(name, color));
  }, [mutate]);

  const deleteTag = useCallback((name: string) => {
    mutate((previous) => {
      const sessionTags: Record<string, string[]> = {};
      for (const [sessionId, tags] of Object.entries(previous.sessionTags)) {
        const kept = tags.filter((tag) => tag !== name);
        if (kept.length > 0) sessionTags[sessionId] = kept;
      }
      return { ...previous, sessionTags, tags: previous.tags.filter((tag) => tag.name !== name) };
    }, () => workbenchApi.deleteTag(name));
    setFilterState((current) => (current.tags.includes(name)
      ? { ...current, tags: current.tags.filter((tag) => tag !== name) }
      : current));
  }, [mutate]);

  const startSessionInProject = useCallback((project: Pick<Project, 'projectId'> & Partial<Project>) => {
    const { projects, onNewSession, refreshProjects } = hostRef.current;
    // Prefer the live project object so the sidebar highlights the same row.
    const known = projects.find((candidate) => candidate.projectId === project.projectId);
    setIsLauncherOpen(false);
    onNewSession(known ?? { sessions: [], ...project } as Project);
    if (!known) void refreshProjects();
  }, []);

  // The pencil button and Ctrl/⌘+Alt+N open the launcher (desktop). On mobile,
  // where the launcher is not shown, start in the current or latest project.
  const startSessionInCurrentProject = useCallback(() => {
    const { selectedProject, projects, onNewSession, isMobile } = hostRef.current;
    if (!isMobile) {
      setIsLauncherOpen(true);
      return;
    }
    const target = selectedProject
      ?? [...projects].sort((a, b) => lastActivityOf(b) - lastActivityOf(a))[0]
      ?? null;
    if (target) onNewSession(target);
  }, []);

  const closeLauncher = useCallback(() => setIsLauncherOpen(false), []);

  // Opening a session or a project from the sidebar leaves the launcher.
  const selectionKey = `${host.selectedProject?.projectId ?? ''}|${host.selectedSession?.id ?? ''}`;
  const previousSelectionKeyRef = useRef(selectionKey);
  useEffect(() => {
    if (previousSelectionKeyRef.current !== selectionKey) {
      previousSelectionKeyRef.current = selectionKey;
      setIsLauncherOpen(false);
    }
  }, [selectionKey]);

  const startQuickSession = useCallback(async () => {
    setIsStartingQuickSession(true);
    try {
      const { project } = await workbenchApi.ensureQuickSessionProject();
      startSessionInProject(project);
    } catch (error) {
      console.warn('[workbench] quick session failed', error);
      window.alert(i18next.t('workbench:context.quickFailed', { message: error instanceof Error ? error.message : String(error) }));
    } finally {
      setIsStartingQuickSession(false);
    }
  }, [startSessionInProject]);

  // Ctrl/⌘+Alt+N: new session in the current project. Ctrl/⌘+Alt+K: quick session.
  // event.code is used because Alt changes event.key on macOS.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || !event.altKey || event.shiftKey) return;
      if (event.code === 'KeyN') {
        event.preventDefault();
        startSessionInCurrentProject();
      } else if (event.code === 'KeyK') {
        event.preventDefault();
        void startQuickSession();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [startQuickSession, startSessionInCurrentProject]);

  const tagColors = useMemo(
    () => new Map(state.tags.map((tag) => [tag.name, tag.color] as const)),
    [state.tags],
  );

  const data = useMemo<WorkbenchData>(() => ({
    isReady,
    settings,
    projectIdentities: state.projectIdentities,
    tagColors,
    sessionTags: state.sessionTags,
    projectCreatedAt: state.projectCreatedAt,
    filter,
    setFilter,
    saveSettings,
    setProjectIdentity,
    setSessionTags,
    setTagColor,
    deleteTag,
    openDialog: setDialog,
    startSessionInCurrentProject,
    startQuickSession,
    isStartingQuickSession,
    avatarImages,
    setAvatarImage,
    sessionViews: state.sessionViews,
    isLauncherOpen,
    closeLauncher,
    startSessionInProject,
    statusFilter,
    setStatusFilter,
  }), [
    statusFilter, setStatusFilter,
    isLauncherOpen, closeLauncher, startSessionInProject,
    avatarImages, setAvatarImage, state.sessionViews,
    deleteTag, filter, isReady, isStartingQuickSession, saveSettings, setFilter, setProjectIdentity,
    setSessionTags, setTagColor, settings, startQuickSession, startSessionInCurrentProject,
    state.projectCreatedAt, state.projectIdentities, state.sessionTags, tagColors,
  ]);

  return (
    <WorkbenchDataContext.Provider value={data}>
      <WorkbenchHostContext.Provider value={host}>
        <SessionActivityContext.Provider value={sessionActivity}>
          <LiveStatusContext.Provider value={liveStatus}>
            {children}
          </LiveStatusContext.Provider>
        </SessionActivityContext.Provider>
        <WorkbenchDialogs dialog={dialog} onClose={() => setDialog(null)} projects={host.projects} />
      </WorkbenchHostContext.Provider>
    </WorkbenchDataContext.Provider>
  );
}

function mergePatch(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const current = merged[key];
    if (value === null) delete merged[key];
    else if (value && typeof value === 'object' && !Array.isArray(value) && current && typeof current === 'object' && !Array.isArray(current)) {
      merged[key] = mergePatch(current as Record<string, unknown>, value as Record<string, unknown>);
    } else merged[key] = value;
  }
  return merged;
}

/**
 * Used by every workbench component and by the sidebar/workspace integration
 * points. Null outside the provider (tests, standalone shells), and every
 * caller renders nothing extra in that case — upstream behaviour is kept.
 */
export function useWorkbench(): WorkbenchData | null {
  return useContext(WorkbenchDataContext);
}

/** Used by the activity bar, the only workbench piece that follows the active tab. */
export function useWorkbenchHost(): WorkbenchHost | null {
  return useContext(WorkbenchHostContext);
}

/** Used by the session status slot: live last-activity time (ms) of a session, or 0 if unknown. */
export function useSessionActivity(sessionId: string): number {
  return useContext(SessionActivityContext)?.get(sessionId) ?? 0;
}

/** Used by the session status slot and alarm badge: the server-read live status of a session. */
export function useLiveSessionStatus(sessionId: string): LiveSessionStatus | undefined {
  return useContext(LiveStatusContext)[sessionId];
}

/** Used by useSessionStatusResolver: the whole live-status map. */
export function useLiveStatusMap(): Readonly<Record<string, LiveSessionStatus>> {
  return useContext(LiveStatusContext);
}

/** Used by useSessionStatusResolver: the whole live-activity map. */
export function useSessionActivityMap(): ReadonlyMap<string, number> | null {
  return useContext(SessionActivityContext);
}
