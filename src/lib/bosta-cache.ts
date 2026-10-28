import type { ActionItem } from "./bosta";
import { getSnapshot } from "./snapshot";

/**
 * Bump whenever `ActionItem` changes shape. A snapshot written by an older
 * deploy is ignored rather than handed to a UI that expects new fields.
 */
const SNAPSHOT_VERSION = 3;

export interface ActionSnapshot {
  items: ActionItem[];
  fetchedAt: string;
  cached: boolean;
  stale: boolean;
  staleReason?: string;
}

export async function getActionSnapshot(
  db: D1Database,
  load: () => Promise<ActionItem[]>,
  options: { forceRefresh?: boolean } = {},
): Promise<ActionSnapshot> {
  const snapshot = await getSnapshot(db, "bosta_snapshot", SNAPSHOT_VERSION, load, options);
  return {
    items: snapshot.data,
    fetchedAt: snapshot.fetchedAt,
    cached: snapshot.cached,
    stale: snapshot.stale,
    staleReason: snapshot.staleReason,
  };
}
