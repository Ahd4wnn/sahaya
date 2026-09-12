import { useState } from "react";

/**
 * The parts Categories and Skills share.
 *
 * Both screens are the same interaction: a draggable list whose order is edited
 * locally and saved as one request, rows that archive rather than delete, and
 * an editor whose slug is fixed once created. Keeping that in one place means
 * "drag, reconcile, save once" has a single implementation -- the reconciliation
 * below is subtle enough that two copies would drift. The row controls are
 * `IconButton` in components/kit/Button.tsx.
 */

/** Mirrors SLUG_RE in backend/app/api/v1/admin.py. */
export const SLUG_RE = /^[a-z][a-z0-9_]{1,39}$/;

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^[^a-z]+/, "")
    .replace(/_+$/, "")
    .slice(0, 40);
}

/**
 * An unsaved order, reconciled with the server's copy.
 *
 * A row added or archived in another tab is never lost from, nor stuck in, the
 * local order: ids the server no longer has drop out, and ids it has gained are
 * appended. `changed` is false whenever the local order matches the saved one,
 * so the Save button appears only when there is something to save.
 */
export function useOrderDraft<T extends { id: string }>(saved: T[]) {
  const [orderIds, setOrderIds] = useState<string[] | null>(null);

  const byId = new Map(saved.map((row) => [row.id, row]));
  const savedIds = saved.map((row) => row.id);
  const ids = orderIds
    ? [
        ...orderIds.filter((id) => byId.has(id)),
        ...savedIds.filter((id) => !orderIds.includes(id)),
      ]
    : savedIds;
  const list = ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });

  function move(id: string, by: -1 | 1) {
    const from = ids.indexOf(id);
    const to = from + by;
    if (from < 0 || to < 0 || to >= ids.length) return;
    const next = [...ids];
    [next[from], next[to]] = [next[to]!, next[from]!];
    setOrderIds(next);
  }

  return {
    ids,
    list,
    changed: ids.join() !== savedIds.join(),
    setOrderIds,
    reset: () => setOrderIds(null),
    move,
  };
}
