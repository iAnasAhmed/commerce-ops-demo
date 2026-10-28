/**
 * A cached pull, shared by everyone who opens a tab. A load inside the window
 * reads D1 instead of calling Bosta or Shopify, and if the upstream fails — a
 * rate limit, an outage — the last good pull is served, marked stale, rather
 * than an empty page.
 */

/** Only these tables, so a table name is never built from input. */
export type SnapshotTable =
  | "bosta_snapshot"
  | "order_issues_snapshot"
  | "growth_snapshot"
  | "customers_snapshot"
  | "month_snapshot";

const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000;

interface SnapshotRow {
  fetched_at: string;
  payload: string;
}

interface StoredPayload<T> {
  v: number;
  data: T;
}

export interface Snapshot<T> {
  data: T;
  fetchedAt: string;
  /** Served from D1 rather than a fresh upstream call. */
  cached: boolean;
  /** The upstream failed, so this is older than the cache window. */
  stale: boolean;
  staleReason?: string;
}

async function readSnapshot<T>(
  db: D1Database,
  table: SnapshotTable,
  version: number,
): Promise<{ fetchedAt: string; data: T } | null> {
  const row = await db
    .prepare(`SELECT fetched_at, payload FROM ${table} WHERE id = 1`)
    .first<SnapshotRow>();
  if (!row) return null;

  try {
    const parsed = JSON.parse(row.payload) as Partial<StoredPayload<T>>;
    // A payload written by an older deploy has a different shape — ignore it.
    if (parsed.v !== version || parsed.data === undefined) return null;
    return { fetchedAt: row.fetched_at, data: parsed.data };
  } catch {
    return null;
  }
}

async function writeSnapshot<T>(
  db: D1Database,
  table: SnapshotTable,
  version: number,
  data: T,
  fetchedAt: string,
) {
  const payload: StoredPayload<T> = { v: version, data };
  await db
    .prepare(
      `INSERT INTO ${table} (id, fetched_at, payload) VALUES (1, ?1, ?2)
       ON CONFLICT(id) DO UPDATE SET fetched_at = excluded.fetched_at, payload = excluded.payload`,
    )
    .bind(fetchedAt, JSON.stringify(payload))
    .run();
}

export async function getSnapshot<T>(
  db: D1Database,
  table: SnapshotTable,
  version: number,
  load: () => Promise<T>,
  { forceRefresh = false, maxAgeMs = DEFAULT_MAX_AGE_MS }: { forceRefresh?: boolean; maxAgeMs?: number } = {},
): Promise<Snapshot<T>> {
  const existing = await readSnapshot<T>(db, table, version);
  const age = existing ? Date.now() - new Date(existing.fetchedAt).getTime() : Infinity;

  if (existing && !forceRefresh && age < maxAgeMs) {
    return { data: existing.data, fetchedAt: existing.fetchedAt, cached: true, stale: false };
  }

  try {
    const data = await load();
    const fetchedAt = new Date().toISOString();
    await writeSnapshot(db, table, version, data, fetchedAt);
    return { data, fetchedAt, cached: false, stale: false };
  } catch (error) {
    if (!existing) throw error;
    return {
      data: existing.data,
      fetchedAt: existing.fetchedAt,
      cached: true,
      stale: true,
      staleReason: error instanceof Error ? error.message : "Upstream request failed",
    };
  }
}
