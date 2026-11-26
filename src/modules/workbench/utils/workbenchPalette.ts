/**
 * CozyCLI: the color palette and generated defaults for project identities and
 * session tags.
 *
 * Every class is spelled out literally so Tailwind's scanner keeps it. The
 * keys are mirrored by the server's validator in server/modules/workbench.
 */
export type WorkbenchColorKey =
  | 'slate' | 'red' | 'orange' | 'amber' | 'lime' | 'green'
  | 'teal' | 'cyan' | 'blue' | 'indigo' | 'violet' | 'pink';

type PaletteEntry = {
  /** Human label in the color picker. */
  label: string;
  /** Solid fill for the stripe, the picker swatch and the filled badge. */
  solid: string;
  /** Tinted chip background plus readable text, for tags and inline labels. */
  soft: string;
  /** Text-only accent, for a project name next to its badge. */
  text: string;
};

export const WORKBENCH_PALETTE: Record<WorkbenchColorKey, PaletteEntry> = {
  slate: { label: '石板', solid: 'bg-slate-500 text-white', soft: 'bg-slate-500/15 text-slate-700 dark:text-slate-300', text: 'text-slate-600 dark:text-slate-300' },
  red: { label: '红', solid: 'bg-red-500 text-white', soft: 'bg-red-500/15 text-red-700 dark:text-red-300', text: 'text-red-600 dark:text-red-400' },
  orange: { label: '橙', solid: 'bg-orange-500 text-white', soft: 'bg-orange-500/15 text-orange-700 dark:text-orange-300', text: 'text-orange-600 dark:text-orange-400' },
  amber: { label: '琥珀', solid: 'bg-amber-500 text-white', soft: 'bg-amber-500/15 text-amber-700 dark:text-amber-300', text: 'text-amber-600 dark:text-amber-400' },
  lime: { label: '青柠', solid: 'bg-lime-600 text-white', soft: 'bg-lime-500/15 text-lime-700 dark:text-lime-300', text: 'text-lime-700 dark:text-lime-400' },
  green: { label: '绿', solid: 'bg-green-600 text-white', soft: 'bg-green-500/15 text-green-700 dark:text-green-300', text: 'text-green-700 dark:text-green-400' },
  teal: { label: '青', solid: 'bg-teal-600 text-white', soft: 'bg-teal-500/15 text-teal-700 dark:text-teal-300', text: 'text-teal-700 dark:text-teal-400' },
  cyan: { label: '天青', solid: 'bg-cyan-600 text-white', soft: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300', text: 'text-cyan-700 dark:text-cyan-400' },
  blue: { label: '蓝', solid: 'bg-blue-500 text-white', soft: 'bg-blue-500/15 text-blue-700 dark:text-blue-300', text: 'text-blue-600 dark:text-blue-400' },
  indigo: { label: '靛', solid: 'bg-indigo-500 text-white', soft: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300', text: 'text-indigo-600 dark:text-indigo-400' },
  violet: { label: '紫', solid: 'bg-violet-500 text-white', soft: 'bg-violet-500/15 text-violet-700 dark:text-violet-300', text: 'text-violet-600 dark:text-violet-400' },
  pink: { label: '粉', solid: 'bg-pink-500 text-white', soft: 'bg-pink-500/15 text-pink-700 dark:text-pink-300', text: 'text-pink-600 dark:text-pink-400' },
};

export const WORKBENCH_COLOR_KEYS = Object.keys(WORKBENCH_PALETTE) as WorkbenchColorKey[];

/** Narrows a stored value to a palette key, or null when it is not one. */
export function toColorKey(value: unknown): WorkbenchColorKey | null {
  return typeof value === 'string' && value in WORKBENCH_PALETTE ? value as WorkbenchColorKey : null;
}

/** FNV-1a: a stable, well-spread hash so a project keeps its generated color across devices. */
function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** The generated color for a project without a custom one; keyed by id so a rename keeps it. */
export function defaultColorFor(seed: string): WorkbenchColorKey {
  // Slate is skipped: it reads as "no color" and is left for an explicit choice.
  const choices = WORKBENCH_COLOR_KEYS.filter((key) => key !== 'slate');
  return choices[hashString(seed) % choices.length];
}
