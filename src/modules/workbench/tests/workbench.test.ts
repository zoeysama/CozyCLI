import assert from 'node:assert/strict';

import { test } from 'vitest';

import { i18n } from '@/modules/i18n';
import enWorkbench from '@/modules/i18n/locales/en/workbench.json';
import zhWorkbench from '@/modules/i18n/locales/zh-CN/workbench.json';

import { formatReset, parseClaudeUsage, parseCodexUsage } from '@/modules/workbench/utils/usageParsers';
import { defaultColorFor, toColorKey } from '@/modules/workbench/utils/workbenchPalette';
import { resolveWorkbenchSettings } from '@/modules/workbench/utils/workbenchSettings';
import { resolveSessionStatus } from '@/modules/workbench/utils/sessionStatus';
import { applyItemOrder, fitItems, moveItem, shiftItem } from '@/modules/workbench/utils/activityBarOrder';

// Shapes captured from the installed Claude Usage / Codex Usage plugins (2026-11-26).
const CLAUDE_PAYLOAD = {
  plan: 'pro',
  limits: [
    { kind: 'session', label: 'Session (5h)', percent: 29, resetsAt: '2026-11-26T16:20:00.151396+00:00' },
    { kind: 'weekly_all', label: 'Weekly (all models)', percent: 31, resetsAt: '2026-11-30T19:00:00+00:00' },
    { kind: 'weekly_scoped', label: 'Weekly — Fable', percent: 0, resetsAt: '2026-11-30T19:00:00+00:00' },
  ],
};

const CODEX_PAYLOAD = {
  limits: [{
    id: 'codex',
    windows: [
      { kind: 'primary', usedPercent: 2, windowDurationMins: 300, resetsAt: '2026-11-26T16:29:54.000Z' },
      { kind: 'secondary', usedPercent: 44, windowDurationMins: 10080, resetsAt: '2026-11-30T14:49:33.000Z' },
    ],
  }],
};

test('usage parsers read the plugin payloads, including a wrapped one', () => {
  const claude = parseClaudeUsage(CLAUDE_PAYLOAD);
  assert.equal(claude?.h5, 29);
  assert.equal(claude?.d7, 31);
  assert.equal(claude?.h5ResetAt, Date.parse('2026-11-26T16:20:00.151396+00:00'));

  const codex = parseCodexUsage({ data: CODEX_PAYLOAD });
  assert.equal(codex?.h5, 2);
  assert.equal(codex?.d7, 44);

  assert.equal(parseClaudeUsage({ nothing: 'here' }), null);
});

test('reset countdowns follow the UI language', async () => {
  const now = Date.parse('2026-11-26T12:00:00Z');
  await i18n.changeLanguage('en');
  assert.equal(formatReset(now + (2 * 60 + 5) * 60000, 'h5', now), '2h 5m');
  assert.equal(formatReset(now + (3 * 24 + 4) * 3600000, 'd7', now), '3d 4h');
  await i18n.changeLanguage('zh-CN');
  assert.equal(formatReset(now + (2 * 60 + 5) * 60000, 'h5', now), '2时-5分');
  assert.equal(formatReset(now + (3 * 24 + 4) * 3600000, 'd7', now), '3天-4时');
  assert.equal(formatReset(null, 'h5', now), '');
  await i18n.changeLanguage('en');
});

test('workbench translations: English and Chinese have the same keys, and every key the code uses exists', () => {
  const flatten = (value: unknown, prefix = ''): string[] => Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    (typeof child === 'object' && child !== null ? flatten(child, `${prefix}${key}.`) : [`${prefix}${key}`]));
  // Plural forms differ per language (en: _one/_other, zh: _other), so compare base keys.
  const base = (keys: string[]) => [...new Set(keys.map((key) => key.replace(/_(zero|one|two|few|many|other)$/, '')))].sort();
  const en = base(flatten(enWorkbench));
  assert.deepEqual(base(flatten(zhWorkbench)), en);

  const sources = import.meta.glob(['../**/*.{ts,tsx}', '../../chat/composer/ChatComposer.tsx', '../../sidebar/SessionOptions.tsx', '../../settings/tabs/AboutTab.tsx', '!../tests/**'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
  const known = new Set(en);
  const used = new Set<string>();
  for (const source of Object.values(sources)) {
    // Unprefixed keys belong to the workbench namespace only where it is the hook's namespace.
    const ownNamespace = source.includes("useTranslation('workbench')");
    for (const match of source.matchAll(/\bt\('(workbench:)?([\w.]+)'/g)) {
      if (match[1] || ownNamespace) used.add(match[2]);
    }
    for (const match of source.matchAll(/label: 'palette\.(\w+)'/g)) used.add(`palette.${match[1]}`);
  }
  const missing = [...used].filter((key) => !known.has(key));
  assert.deepEqual(missing, []);
  assert.ok(used.size > 150, `only ${used.size} keys found; the scan is broken`);
});

test('generated colors are stable and never slate', () => {
  assert.equal(defaultColorFor('project-a'), defaultColorFor('project-a'));
  assert.notEqual(defaultColorFor('project-a'), 'slate');
  assert.equal(toColorKey('violet'), 'violet');
  assert.equal(toColorKey('#ff0000'), null);
});

test('settings fall back to defaults field by field', () => {
  const settings = resolveWorkbenchSettings({ cleanup: { hideReportIssue: false }, usageMeter: { refreshMinutes: 0 } });
  assert.equal(settings.cleanup.hideReportIssue, false);
  assert.equal(settings.cleanup.hideGithubStar, true);
  assert.equal(settings.usageMeter.refreshMinutes, 5);
  assert.equal(settings.activityBar.enabled, true);
});

test('the standard usage contract works in both shapes, and auto falls back to the plugin shapes', async () => {
  const { parseStandardUsage, parseUsage } = await import('@/modules/workbench/utils/usageParsers');
  const flat = parseStandardUsage({ data: { h5: 12, d7: 40, h5ResetAt: '2026-11-26T16:00:00Z', d7ResetAt: 1795800000 } });
  assert.equal(flat?.h5, 12);
  assert.equal(flat?.d7ResetAt, 1795800000 * 1000);
  const windows = parseStandardUsage({ windows: [{ window: '5h', usedPercent: 3 }, { window: '7d', usedPercent: 9 }] });
  assert.deepEqual([windows?.h5, windows?.d7], [3, 9]);
  assert.equal(parseUsage('auto', CLAUDE_PAYLOAD)?.h5, 29);
  assert.equal(parseUsage('auto', CODEX_PAYLOAD)?.d7, 44);
});

test('custom usage sources are validated', async () => {
  const { readCustomUsageSources } = await import('@/modules/workbench/utils/usageSources');
  const sources = readCustomUsageSources([
    { id: 'g', label: 'Gemini', plugin: 'gemini-usage', route: '/usage', color: 'red', parser: 'nope' },
    { id: 'broken', label: '', plugin: 'x', route: 'y' },
  ]);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].route, 'usage');
  assert.equal(sources[0].color, '#6366f1');
  assert.equal(sources[0].parser, 'auto');
});

test('the Chat Avatars userscript is imported: images, names and framing', async () => {
  const { parseAvatarUserscript } = await import('@/modules/workbench/utils/avatarImages');
  const script = String.raw`
const css = String.raw\`
.chat-message.assistant div:has(> svg[aria-label="Codex"]),
.chat-message.assistant div:has(> svg[aria-label="Claude"]) { width: 38px !important; background-size: cover !important; }
.chat-message.user > div > div:last-child { background-size: contain !important; background-color: #ffffff !important; }
.chat-message.assistant .mb-2.flex.items-center.space-x-3:has(svg[aria-label="OpenCode"]) > div:nth-child(2)::after { content: "小助手"; font-size: 14px !important; }
.chat-message.assistant div:has(> svg[aria-label="Codex"]) { background-image: url("data:image/webp;base64,AAAA") !important; }
.chat-message.assistant div:has(> svg[aria-label="OpenCode"]) { background-image: url("data:image/png;base64,BBBB") !important; }
.chat-message.user > div > div:last-child { background-image: url("data:image/png;base64,CCCC") !important; }
\`;
GM_addStyle(\`
.chat-message.assistant div:has(> svg[aria-label="OpenCode"]) { background-size: 150% auto !important; background-position: center 20% !important; }
\`);
GM_addStyle(\`
.chat-message.user > div > div:last-child { background-size: 150% auto !important; background-position: 35% 20% !important; }
\`);`;
  const imported = parseAvatarUserscript(script);
  assert.deepEqual(Object.keys(imported.images).sort(), ['codex', 'opencode', 'user']);
  assert.equal(imported.images.codex, 'data:image/webp;base64,AAAA');
  assert.equal(imported.styles.opencode?.name, '小助手');
  assert.deepEqual([imported.styles.opencode?.zoom, imported.styles.opencode?.posX, imported.styles.opencode?.posY], [150, 50, 20]);
  assert.deepEqual([imported.styles.user?.zoom, imported.styles.user?.posX, imported.styles.user?.posY], [150, 35, 20]);
  assert.equal(imported.styles.user?.whiteBackground, true);
});

test('the status slot shows one status, highest priority first', async () => {
  const base = { isProcessing: false, hasBackgroundWork: false, isSelected: false, lastActivity: 5000, viewedAt: 0, unreadBaseline: 0, showRecentDot: false, now: 6000 };
  assert.equal(resolveSessionStatus({ ...base, isProcessing: true, hasBackgroundWork: true }), 'running');
  assert.equal(resolveSessionStatus({ ...base, hasBackgroundWork: true }), 'background');
  assert.equal(resolveSessionStatus(base), 'unread');
  assert.equal(resolveSessionStatus({ ...base, viewedAt: 5000 }), null, 'viewed after the activity');
  assert.equal(resolveSessionStatus({ ...base, unreadBaseline: 5500 }), null, 'activity before the baseline is read');
  assert.equal(resolveSessionStatus({ ...base, isSelected: true }), null, 'the open session is never unread');
  assert.equal(resolveSessionStatus({ ...base, viewedAt: 5000, showRecentDot: true }), 'recent');
});

test('an alarm outranks background work but not a running turn', () => {
  const base = { isProcessing: false, hasBackgroundWork: true, hasAlarm: true, isSelected: false, lastActivity: 0, viewedAt: 0, unreadBaseline: 0, showRecentDot: false, now: 1 };
  assert.equal(resolveSessionStatus(base), 'alarm');
  assert.equal(resolveSessionStatus({ ...base, isProcessing: true }), 'running');
  assert.equal(resolveSessionStatus({ ...base, hasAlarm: false }), 'background');
});

test('activity bar order: user order first, unknown items keep default order after', () => {
  const items = ['chat', 'shell', 'files', 'plugin:a', 'plugin:b'].map((id) => ({ id }));
  const ordered = applyItemOrder(items, ['plugin:b', 'gone', 'chat']).map((item) => item.id);
  assert.deepEqual(ordered, ['plugin:b', 'chat', 'shell', 'files', 'plugin:a']);
  assert.deepEqual(applyItemOrder(items, []).map((item) => item.id), items.map((item) => item.id));
});

test('activity bar order: move and shift', () => {
  const ids = ['a', 'b', 'c', 'd'];
  assert.deepEqual(moveItem(ids, 'd', 'b'), ['a', 'd', 'b', 'c']);
  assert.deepEqual(moveItem(ids, 'a', null), ['b', 'c', 'd', 'a']);
  assert.deepEqual(moveItem(ids, 'b', 'b'), ids);
  assert.deepEqual(shiftItem(ids, 'a', -1), ids);
  assert.deepEqual(shiftItem(ids, 'b', 1), ['a', 'c', 'b', 'd']);
});

test('activity bar overflow keeps room for the more button', () => {
  const items = Array.from({ length: 10 }, (_, index) => ({ kind: index < 4 ? 'builtin' : 'plugin' }));
  // All ten: 10*40 + one separator (13) = 413.
  assert.equal(fitItems(items, 413), 10);
  // 300px: n items + separator (if n > 4) + more button (53) must fit.
  assert.equal(fitItems(items, 300), 5); // 5*40 + 13 + 53 = 266; 6 would be 306
  assert.equal(fitItems(items, 0), 10);
});

test('quick commands: defaults, sanitising and order', async () => {
  await i18n.changeLanguage('en');
  const defaults = resolveWorkbenchSettings({}).quickCommands;
  assert.equal(defaults[1].label, 'Continue');
  await i18n.changeLanguage('zh-CN');
  assert.equal(resolveWorkbenchSettings({}).quickCommands[1].label, '继续');
  await i18n.changeLanguage('en');
  assert.equal(defaults[0].text, '/compact');
  const custom = resolveWorkbenchSettings({ quickCommands: [{ id: 'x', label: 'L', text: '/cost', send: false }, { text: '' }, 'junk'] }).quickCommands;
  assert.deepEqual(custom, [{ id: 'x', label: 'L', text: '/cost', send: false }]);
  assert.deepEqual(resolveWorkbenchSettings({ quickCommands: [] }).quickCommands, []);
});
