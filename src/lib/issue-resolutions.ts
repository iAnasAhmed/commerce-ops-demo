/**
 * Orders someone has marked as handled on the Order Issues tab, with a note.
 * Lives in our own D1 database, like the Action Needed call log — it never
 * touches Shopify or Bosta.
 *
 * A resolution is tied to the issues the order had when it was marked. If a
 * new, different issue appears on the same order later, the order shows again.
 */

export interface IssueResolution {
  orderRef: string;
  issueKey: string;
  note: string;
  resolvedAt: string;
}

interface D1Row {
  order_ref: string;
  issue_key: string;
  note: string | null;
  resolved_at: string;
}

export async function getResolutions(db: D1Database): Promise<IssueResolution[]> {
  const { results } = await db.prepare("SELECT * FROM order_issue_resolutions").all<D1Row>();
  return results.map((row) => ({
    orderRef: row.order_ref,
    issueKey: row.issue_key,
    note: row.note ?? "",
    resolvedAt: row.resolved_at,
  }));
}

export async function resolveOrder(
  db: D1Database,
  entry: { orderRef: string; issueKey: string; note: string },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO order_issue_resolutions (order_ref, issue_key, note, resolved_at)
       VALUES (?1, ?2, ?3, datetime('now'))
       ON CONFLICT(order_ref) DO UPDATE SET
         issue_key = excluded.issue_key,
         note = excluded.note,
         resolved_at = datetime('now')`,
    )
    .bind(entry.orderRef, entry.issueKey, entry.note)
    .run();
}

export async function reopenOrder(db: D1Database, orderRef: string): Promise<void> {
  await db.prepare("DELETE FROM order_issue_resolutions WHERE order_ref = ?1").bind(orderRef).run();
}
