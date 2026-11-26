import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { scheduledMessagesDb, sessionsDb } from '@/modules/database/index.js';

/**
 * CozyCLI: live session states and pending alarms, read from what is on disk
 * rather than from this server's own run registry.
 *
 * That matters because a session's process may belong to another CloudCLI
 * instance (a test instance, or the agent runner later), or to a terminal:
 *  - ~/.claude/sessions/<pid>.json — Claude Code's process registry. A live
 *    process that is `busy` is running a turn; one that is `idle` but was
 *    started by CloudCLI only stays alive for background work.
 *  - ~/.local/state/agent-wake/pending/*.json — long alarms (agent-wake).
 *  - the session transcript — the latest ScheduleWakeup call.
 *  - CloudCLI's own scheduled messages.
 */

export type LiveSessionStatus = {
  state?: 'running' | 'background';
  /** Earliest pending alarm (ms) and what set it. */
  alarmAt?: number;
  alarmSource?: 'wakeup' | 'agent-wake' | 'scheduled-message';
};

type RegistryEntry = { pid?: number; sessionId?: string; status?: string; entrypoint?: string };

/** How much of a transcript's tail is scanned for the latest ScheduleWakeup. */
const TRANSCRIPT_TAIL_BYTES = 512 * 1024;
const CACHE_MS = 5000;

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: alive but owned by someone else; still alive.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

async function readTail(file: string, bytes: number): Promise<string> {
  const handle = await fs.open(file, 'r');
  try {
    const { size } = await handle.stat();
    const start = Math.max(0, size - bytes);
    const buffer = Buffer.alloc(size - start);
    await handle.read(buffer, 0, buffer.length, start);
    return buffer.toString('utf8');
  } finally {
    await handle.close();
  }
}

/**
 * The fire time of the latest ScheduleWakeup in a transcript tail, or null
 * (none, or the latest one stopped the loop). Exported for tests.
 */
export function latestWakeupAt(transcriptTail: string): number | null {
  let latest: { at: number; stop: boolean; stamp: number } | null = null;
  for (const line of transcriptTail.split('\n')) {
    if (!line.includes('"ScheduleWakeup"')) continue;
    let entry: { timestamp?: string; message?: { content?: unknown } };
    try {
      entry = JSON.parse(line);
    } catch {
      continue; // the first line of a tail is usually cut
    }
    const stamp = Date.parse(entry.timestamp ?? '');
    const content = Array.isArray(entry.message?.content) ? entry.message.content : [];
    for (const block of content as { type?: string; name?: string; input?: Record<string, unknown> }[]) {
      if (block?.type !== 'tool_use' || block.name !== 'ScheduleWakeup' || !Number.isFinite(stamp)) continue;
      const delay = Number(block.input?.delaySeconds);
      const stop = block.input?.stop === true;
      if (!latest || stamp >= latest.stamp) {
        latest = { at: stamp + (Number.isFinite(delay) ? delay * 1000 : 0), stop, stamp };
      }
    }
  }
  return latest && !latest.stop ? latest.at : null;
}

/** Creates the session-status reader; paths are injectable for tests. */
export function createSessionStatusService(homedir: () => string = () => os.homedir()) {
  let cache: { at: number; userId: number; value: Record<string, LiveSessionStatus> } | null = null;

  async function findTranscript(sessionId: string): Promise<string | null> {
    const projectsDir = path.join(homedir(), '.claude', 'projects');
    let dirs: string[];
    try {
      dirs = await fs.readdir(projectsDir);
    } catch {
      return null;
    }
    for (const dir of dirs) {
      const candidate = path.join(projectsDir, dir, `${sessionId}.jsonl`);
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
        // not in this project
      }
    }
    return null;
  }

  /**
   * The registry, transcripts and agent-wake use Claude's own session id; the
   * sidebar keys rows by CloudCLI's app session id. Unknown ids pass through.
   */
  const toAppSessionId = (providerSessionId: string): string => {
    try {
      return sessionsDb.getSessionByProviderSessionId(providerSessionId)?.session_id ?? providerSessionId;
    } catch {
      return providerSessionId;
    }
  };

  async function compute(userId: number): Promise<Record<string, LiveSessionStatus>> {
    const result: Record<string, LiveSessionStatus> = {};
    const now = Date.now();
    const addAlarm = (sessionId: string, at: number, source: LiveSessionStatus['alarmSource']) => {
      if (!(at > now)) return;
      const entry = (result[toAppSessionId(sessionId)] ??= {});
      if (entry.alarmAt === undefined || at < entry.alarmAt) {
        entry.alarmAt = at;
        entry.alarmSource = source;
      }
    };

    // Live processes.
    const registryDir = path.join(homedir(), '.claude', 'sessions');
    const liveSessionIds: string[] = [];
    let registryFiles: string[] = [];
    try {
      registryFiles = (await fs.readdir(registryDir)).filter((name) => name.endsWith('.json'));
    } catch {
      // no registry
    }
    for (const name of registryFiles) {
      const entry = await readJson<RegistryEntry>(path.join(registryDir, name));
      if (!entry?.sessionId || !entry.pid || !isAlive(entry.pid)) continue;
      liveSessionIds.push(entry.sessionId);
      const appSessionId = toAppSessionId(entry.sessionId);
      if (entry.status === 'busy') {
        (result[appSessionId] ??= {}).state = 'running';
      } else if (entry.status === 'idle' && entry.entrypoint === 'claudecodeui') {
        // CloudCLI lets an idle process exit unless background work holds it.
        (result[appSessionId] ??= {}).state = 'background';
      }
    }

    // ScheduleWakeup only matters while its session's process is alive.
    await Promise.all(liveSessionIds.map(async (sessionId) => {
      const transcript = await findTranscript(sessionId);
      if (!transcript) return;
      try {
        const at = latestWakeupAt(await readTail(transcript, TRANSCRIPT_TAIL_BYTES));
        if (at !== null) addAlarm(sessionId, at, 'wakeup');
      } catch {
        // unreadable transcript: no alarm shown
      }
    }));

    // agent-wake long alarms (seconds since epoch).
    const pendingDir = path.join(homedir(), '.local', 'state', 'agent-wake', 'pending');
    let pendingFiles: string[] = [];
    try {
      pendingFiles = (await fs.readdir(pendingDir)).filter((name) => name.endsWith('.json'));
    } catch {
      // agent-wake not installed
    }
    for (const name of pendingFiles) {
      const alarm = await readJson<{ session?: string; at?: number }>(path.join(pendingDir, name));
      if (alarm?.session && typeof alarm.at === 'number') addAlarm(alarm.session, alarm.at * 1000, 'agent-wake');
    }

    // CloudCLI scheduled messages.
    for (const row of scheduledMessagesDb.listPendingForUser(userId)) {
      addAlarm(row.session_id, Date.parse(row.scheduled_for), 'scheduled-message');
    }

    return result;
  }

  return {
    async getSessionStatus(userId: number) {
      if (cache && cache.userId === userId && Date.now() - cache.at < CACHE_MS) return { sessions: cache.value };
      const value = await compute(userId);
      cache = { at: Date.now(), userId, value };
      return { sessions: value };
    },
  };
}

export const sessionStatusService = createSessionStatusService();
