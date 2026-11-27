import i18next from 'i18next';
import { readCustomUsageSources, type UsageSource } from '@/modules/workbench/utils/usageSources';

/** Who a chat avatar belongs to: one of the providers, or the user. */
export type ChatAvatarKey = 'claude' | 'codex' | 'opencode' | 'cursor' | 'user';

export const CHAT_AVATAR_KEYS: ChatAvatarKey[] = ['claude', 'codex', 'opencode', 'cursor', 'user'];

/** How one avatar image is framed; the image itself is stored separately (see workbenchApi.avatars). */
export type ChatAvatarStyle = {
  /** Shown instead of the provider name above assistant messages; empty keeps the default. */
  name: string;
  /** Image width as % of the circle (100 = fills it). */
  zoom: number;
  /** Focus point of the image, 0-100 on each axis. */
  posX: number;
  posY: number;
  /** Paints white behind transparent images (the userscript did this for the user avatar). */
  whiteBackground: boolean;
};

/** One entry of the composer's common-commands menu. */
export type QuickCommand = {
  id: string;
  label: string;
  /** Text put into the composer, e.g. `/compact` or a prompt. */
  text: string;
  /** Sends right away; otherwise the text is only inserted at the cursor. */
  send: boolean;
};

/** The starter list, in the UI language at the time it is first shown or restored. */
export function getDefaultQuickCommands(): QuickCommand[] {
  const t = (key: string) => i18next.t(`workbench:quickCommands.defaults.${key}`);
  return [
    { id: 'compact', label: t('compact'), text: '/compact', send: true },
    { id: 'continue', label: t('continueLabel'), text: t('continueText'), send: true },
    { id: 'summary', label: t('summaryLabel'), text: t('summaryText'), send: true },
  ];
}

const readQuickCommands = (value: unknown): QuickCommand[] => {
  if (!Array.isArray(value)) return getDefaultQuickCommands();
  return value
    .map((entry) => asRecord(entry))
    .filter((entry) => typeof entry.text === 'string' && entry.text.trim())
    .map((entry, index) => ({
      id: typeof entry.id === 'string' && entry.id ? entry.id : `cmd-${index}`,
      label: typeof entry.label === 'string' ? entry.label.slice(0, 40) : '',
      text: String(entry.text).slice(0, 4000),
      send: asBoolean(entry.send, true),
    }));
};

/**
 * CozyCLI: the workbench settings, stored server-side (so they follow the user
 * across devices) as one merge-patched JSON object.
 */
export type WorkbenchSettings = {
  activityBar: {
    /** Moves every workspace view into the vertical bar and drops the top pill bar on desktop. */
    enabled: boolean;
    /** Tab ids (`chat`, `plugin:<name>`, …) the user chose not to show in the bar. */
    hiddenItems: string[];
    /** Item ids in the order the user dragged them into; items not listed (e.g. new plugins) follow in default order. */
    order: string[];
  };
  /** The composer's "common commands" menu. */
  quickCommands: QuickCommand[];
  cleanup: {
    hideGithubStar: boolean;
    hideReportIssue: boolean;
    hideVersionLink: boolean;
    hideDividers: boolean;
  };
  usageMeter: {
    enabled: boolean;
    /** Source ids (built-in or custom) the user switched off. */
    hiddenSources: string[];
    /** User-added sources, e.g. a Gemini usage plugin. */
    customSources: UsageSource[];
    refreshMinutes: number;
  };
  chatAvatars: {
    enabled: boolean;
    /** Circle diameter in px. */
    size: number;
    styles: Record<ChatAvatarKey, ChatAvatarStyle>;
  };
  quickSession: {
    /** Folder the quick sessions run in; `~` expands on the server. */
    directory: string;
  };
  /** Counts a project folder's creation as activity in the date sort, so a new project starts on top. */
  newProjectsFirst: boolean;
  /** Which sidebar list a page load opens on. */
  sidebarDefaultMode: 'conversations' | 'projects';
  /** Also shows upstream's green "active in the last 10 minutes" dot in the status slot. */
  showRecentDot: boolean;
  /** Set by the server the first time the unread dot is used; older activity counts as read. */
  unreadBaseline: number;
};

/**
 * Defaults follow what the two Tampermonkey scripts this replaces did on this
 * install: footer links, star badge and dividers hidden, usage meter on.
 */
export const DEFAULT_WORKBENCH_SETTINGS: WorkbenchSettings = {
  activityBar: { enabled: true, hiddenItems: [], order: [] },
  // Filled per language by resolveWorkbenchSettings (getDefaultQuickCommands) when nothing is stored.
  quickCommands: [],
  cleanup: {
    hideGithubStar: true,
    hideReportIssue: true,
    hideVersionLink: true,
    hideDividers: true,
  },
  usageMeter: { enabled: true, hiddenSources: [], customSources: [], refreshMinutes: 5 },
  chatAvatars: {
    enabled: true,
    size: 38,
    styles: {
      claude: { name: '', zoom: 100, posX: 50, posY: 50, whiteBackground: false },
      codex: { name: '', zoom: 100, posX: 50, posY: 50, whiteBackground: false },
      opencode: { name: '', zoom: 100, posX: 50, posY: 50, whiteBackground: false },
      cursor: { name: '', zoom: 100, posX: 50, posY: 50, whiteBackground: false },
      user: { name: '', zoom: 100, posX: 50, posY: 50, whiteBackground: true },
    },
  },
  quickSession: { directory: '~/cozycli-quick' },
  newProjectsFirst: true,
  sidebarDefaultMode: 'conversations',
  showRecentDot: false,
  unreadBaseline: 0,
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

const asBoolean = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);

/** Fills every missing or malformed field with its default. */
export function resolveWorkbenchSettings(raw: unknown): WorkbenchSettings {
  const stored = asRecord(raw);
  const activityBar = asRecord(stored.activityBar);
  const cleanup = asRecord(stored.cleanup);
  const usageMeter = asRecord(stored.usageMeter);
  const quickSession = asRecord(stored.quickSession);
  const chatAvatars = asRecord(stored.chatAvatars);
  const avatarStyles = asRecord(chatAvatars.styles);
  const avatarSize = Number(chatAvatars.size);
  const defaults = DEFAULT_WORKBENCH_SETTINGS;
  const refreshMinutes = Number(usageMeter.refreshMinutes);

  return {
    activityBar: {
      enabled: asBoolean(activityBar.enabled, defaults.activityBar.enabled),
      hiddenItems: Array.isArray(activityBar.hiddenItems)
        ? activityBar.hiddenItems.filter((item): item is string => typeof item === 'string')
        : defaults.activityBar.hiddenItems,
      order: Array.isArray(activityBar.order)
        ? activityBar.order.filter((item): item is string => typeof item === 'string')
        : [],
    },
    quickCommands: readQuickCommands(stored.quickCommands),
    cleanup: {
      hideGithubStar: asBoolean(cleanup.hideGithubStar, defaults.cleanup.hideGithubStar),
      hideReportIssue: asBoolean(cleanup.hideReportIssue, defaults.cleanup.hideReportIssue),
      hideVersionLink: asBoolean(cleanup.hideVersionLink, defaults.cleanup.hideVersionLink),
      hideDividers: asBoolean(cleanup.hideDividers, defaults.cleanup.hideDividers),
    },
    usageMeter: {
      enabled: asBoolean(usageMeter.enabled, defaults.usageMeter.enabled),
      hiddenSources: Array.isArray(usageMeter.hiddenSources)
        ? usageMeter.hiddenSources.filter((item): item is string => typeof item === 'string')
        : [],
      customSources: readCustomUsageSources(usageMeter.customSources),
      refreshMinutes: Number.isFinite(refreshMinutes) && refreshMinutes >= 1 && refreshMinutes <= 120
        ? refreshMinutes
        : defaults.usageMeter.refreshMinutes,
    },
    quickSession: {
      directory: typeof quickSession.directory === 'string' && quickSession.directory.trim()
        ? quickSession.directory.trim()
        : defaults.quickSession.directory,
    },
    newProjectsFirst: asBoolean(stored.newProjectsFirst, defaults.newProjectsFirst),
    sidebarDefaultMode: stored.sidebarDefaultMode === 'projects' ? 'projects' : 'conversations',
    showRecentDot: asBoolean(stored.showRecentDot, defaults.showRecentDot),
    unreadBaseline: typeof stored.unreadBaseline === 'number' ? stored.unreadBaseline : Date.now(),
    chatAvatars: {
      enabled: asBoolean(chatAvatars.enabled, defaults.chatAvatars.enabled),
      size: Number.isFinite(avatarSize) && avatarSize >= 24 && avatarSize <= 64 ? avatarSize : defaults.chatAvatars.size,
      styles: Object.fromEntries(CHAT_AVATAR_KEYS.map((key) => {
        const style = asRecord(avatarStyles[key]);
        const fallback = defaults.chatAvatars.styles[key];
        const number = (value: unknown, min: number, max: number, def: number) => {
          const n = Number(value);
          return Number.isFinite(n) && n >= min && n <= max ? n : def;
        };
        return [key, {
          name: typeof style.name === 'string' ? style.name.slice(0, 24) : fallback.name,
          zoom: number(style.zoom, 50, 300, fallback.zoom),
          posX: number(style.posX, 0, 100, fallback.posX),
          posY: number(style.posY, 0, 100, fallback.posY),
          whiteBackground: asBoolean(style.whiteBackground, fallback.whiteBackground),
        }];
      })) as Record<ChatAvatarKey, ChatAvatarStyle>,
    },
  };
}
