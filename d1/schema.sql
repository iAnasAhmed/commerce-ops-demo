-- Run once against a new D1 database:
--   npx wrangler d1 execute velora-demo-db --remote --file=d1/schema.sql
--   npx wrangler d1 execute velora-demo-db --local  --file=d1/schema.sql
--
-- One table. Who was called about a stuck delivery, and what they said. The
-- only thing this app writes anywhere.

-- The last good Bosta pull for the Action Needed tab. One row, reused for five
-- minutes, and served (marked stale) if Bosta rate-limits or fails.
CREATE TABLE IF NOT EXISTS bosta_snapshot (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  fetched_at TEXT NOT NULL,
  payload TEXT NOT NULL
);

-- The last good Order Issues check (Shopify + Bosta), same five-minute reuse.
CREATE TABLE IF NOT EXISTS order_issues_snapshot (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  fetched_at TEXT NOT NULL,
  payload TEXT NOT NULL
);

-- Orders marked as handled on the Order Issues tab. issue_key is the set of
-- issues the order had when marked; a different set shows the order again.
CREATE TABLE IF NOT EXISTS order_issue_resolutions (
  order_ref TEXT PRIMARY KEY,
  issue_key TEXT NOT NULL,
  note TEXT,
  resolved_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Instapay tab: whether the transfer screenshot was checked, by hand.
CREATE TABLE IF NOT EXISTS instapay_checks (
  order_ref TEXT PRIMARY KEY,
  screenshot TEXT NOT NULL DEFAULT 'No',
  note TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS delivery_actions (
  tracking_number TEXT PRIMARY KEY,
  order_ref TEXT,
  contacted TEXT NOT NULL DEFAULT 'No',
  contact_date TEXT,
  reason TEXT,
  notes TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Insights / Test tabs and the Customers tab: cached pulls, like bosta_snapshot.
CREATE TABLE IF NOT EXISTS growth_snapshot (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  fetched_at TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS customers_snapshot (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  fetched_at TEXT NOT NULL,
  payload TEXT NOT NULL
);

-- Customers tab: who was messaged about a reorder or an abandoned checkout.
CREATE TABLE IF NOT EXISTS customer_followups (
  key TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  note TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Who can open the dashboard and what they may see (owner / client / support).
-- The ALLOWED_EMAIL owner is always allowed and is not stored here.
CREATE TABLE IF NOT EXISTS dashboard_users (
  email TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  note TEXT,
  added_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Month tab: cached month-to-date pull.
CREATE TABLE IF NOT EXISTS month_snapshot (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  fetched_at TEXT NOT NULL,
  payload TEXT NOT NULL
);


-- Demo only: what visitors said this system would be worth to them.
CREATE TABLE IF NOT EXISTS offers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  brand TEXT,
  orders_per_day INTEGER,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL,
  pricing TEXT NOT NULL,
  needs TEXT,
  message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
