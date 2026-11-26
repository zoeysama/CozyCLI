/**
 * CozyCLI: the activity bar's user order. `order` lists item ids as the user
 * arranged them; ids no longer present are skipped and items it does not
 * mention (a newly installed plugin) keep their default position relative to
 * each other, after the ordered ones.
 */
export function applyItemOrder<T extends { id: string }>(items: T[], order: string[]): T[] {
  if (order.length === 0) return items;
  const rank = new Map(order.map((id, index) => [id, index]));
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const ra = rank.get(a.item.id);
      const rb = rank.get(b.item.id);
      if (ra !== undefined && rb !== undefined) return ra - rb;
      if (ra !== undefined) return -1;
      if (rb !== undefined) return 1;
      return a.index - b.index;
    })
    .map(({ item }) => item);
}

/** Moves `id` so it lands before `beforeId` (or to the end when null); returns the new id list. */
export function moveItem(ids: string[], id: string, beforeId: string | null): string[] {
  if (id === beforeId) return ids;
  const rest = ids.filter((entry) => entry !== id);
  const target = beforeId === null ? rest.length : rest.indexOf(beforeId);
  if (target < 0) return ids;
  return [...rest.slice(0, target), id, ...rest.slice(target)];
}

/** Moves `id` one step up (-1) or down (+1). */
export function shiftItem(ids: string[], id: string, delta: -1 | 1): string[] {
  const index = ids.indexOf(id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= ids.length) return ids;
  const next = [...ids];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Pixel sizes of the bar's rows (h-9 buttons, gap-1, separator with my-1). */
export const BAR_SLOT_PX = 40;
export const BAR_SEPARATOR_PX = 13;

/**
 * How many of `items` fit in `height` px. When not all fit, room for the
 * "more" button is kept and the rest overflow. Separators sit between
 * neighbours of different kind.
 */
export function fitItems<T extends { kind: string }>(items: T[], height: number): number {
  const cost = (count: number, withMore: boolean) => {
    let total = 0;
    for (let index = 0; index < count; index += 1) {
      if (index > 0 && items[index].kind !== items[index - 1].kind) total += BAR_SEPARATOR_PX;
      total += BAR_SLOT_PX;
    }
    return total + (withMore ? BAR_SLOT_PX + BAR_SEPARATOR_PX : 0);
  };
  if (height <= 0 || cost(items.length, false) <= height) return items.length;
  let count = items.length - 1;
  while (count > 0 && cost(count, true) > height) count -= 1;
  return count;
}
