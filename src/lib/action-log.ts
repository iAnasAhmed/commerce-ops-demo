/**
 * The one piece of state this dashboard writes anywhere: whether someone has
 * called about a delivery that needs a follow-up, and what they were told.
 * Bosta has no field for this, so it lives in our own D1 database, keyed by
 * tracking number. Everything else in this app is read-only by design; this
 * table is the deliberate, narrow exception — it never touches Bosta, Meta,
 * or Shopify, only our own record of who has been called.
 */

export interface ActionLogEntry {
  trackingNumber: string;
  contacted: "Yes" | "No" | "No answer";
  contactDate: string | null;
  reason: string | null;
  notes: string | null;
  updatedAt: string;
}

interface D1Row {
  tracking_number: string;
  contacted: string;
  contact_date: string | null;
  reason: string | null;
  notes: string | null;
  updated_at: string;
}

function fromRow(row: D1Row): ActionLogEntry {
  return {
    trackingNumber: row.tracking_number,
    contacted: (row.contacted as ActionLogEntry["contacted"]) ?? "No",
    contactDate: row.contact_date,
    reason: row.reason,
    notes: row.notes,
    updatedAt: row.updated_at,
  };
}

export async function getActionLog(
  db: D1Database,
): Promise<Map<string, ActionLogEntry>> {
  const { results } = await db
    .prepare("SELECT * FROM delivery_actions")
    .all<D1Row>();
  return new Map(results.map((row) => [row.tracking_number, fromRow(row)]));
}

export async function upsertActionLog(
  db: D1Database,
  entry: {
    trackingNumber: string;
    orderRef: string;
    contacted: "Yes" | "No" | "No answer";
    reason: string;
    notes: string;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO delivery_actions
         (tracking_number, order_ref, contacted, contact_date, reason, notes, updated_at)
       VALUES (?1, ?2, ?3, datetime('now'), ?4, ?5, datetime('now'))
       ON CONFLICT(tracking_number) DO UPDATE SET
         order_ref = excluded.order_ref,
         contacted = excluded.contacted,
         contact_date = datetime('now'),
         reason = excluded.reason,
         notes = excluded.notes,
         updated_at = datetime('now')`,
    )
    .bind(
      entry.trackingNumber,
      entry.orderRef,
      entry.contacted,
      entry.reason,
      entry.notes,
    )
    .run();
}
