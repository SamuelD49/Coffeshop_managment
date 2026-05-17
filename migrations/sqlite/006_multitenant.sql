CREATE TABLE shops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO shops (id, name) VALUES (1, 'Sample Shop');

ALTER TABLE employees             ADD COLUMN shop_id INTEGER NOT NULL DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE guarantors            ADD COLUMN shop_id INTEGER NOT NULL DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE attachments           ADD COLUMN shop_id INTEGER NOT NULL DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE menu_items            ADD COLUMN shop_id INTEGER NOT NULL DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE sales_sessions        ADD COLUMN shop_id INTEGER NOT NULL DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE sale_line_items       ADD COLUMN shop_id INTEGER NOT NULL DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE purchase_requisitions ADD COLUMN shop_id INTEGER NOT NULL DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE petty_cash_entries    ADD COLUMN shop_id INTEGER NOT NULL DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE payroll_runs          ADD COLUMN shop_id INTEGER NOT NULL DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE payroll_entries       ADD COLUMN shop_id INTEGER NOT NULL DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE audit_log             ADD COLUMN shop_id INTEGER NOT NULL DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE;

CREATE INDEX idx_employees_shop             ON employees(shop_id);
CREATE INDEX idx_guarantors_shop            ON guarantors(shop_id);
CREATE INDEX idx_attachments_shop           ON attachments(shop_id);
CREATE INDEX idx_menu_items_shop            ON menu_items(shop_id);
CREATE INDEX idx_sales_sessions_shop_date   ON sales_sessions(shop_id, business_date);
CREATE INDEX idx_sale_lines_shop            ON sale_line_items(shop_id);
CREATE INDEX idx_purchases_shop_date        ON purchase_requisitions(shop_id, purchase_date);
CREATE INDEX idx_petty_shop_date            ON petty_cash_entries(shop_id, entry_date);
CREATE INDEX idx_payroll_runs_shop          ON payroll_runs(shop_id);
CREATE INDEX idx_payroll_entries_shop       ON payroll_entries(shop_id);
CREATE INDEX idx_audit_shop                 ON audit_log(shop_id);

DROP INDEX IF EXISTS idx_employees_username;
CREATE UNIQUE INDEX idx_employees_username_per_shop ON employees(shop_id, username) WHERE username IS NOT NULL;

-- Settings: SQLite can't drop a primary key. We recreate the table.
CREATE TABLE settings_new (
  shop_id INTEGER NOT NULL DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (shop_id, key)
);
INSERT INTO settings_new (shop_id, key, value, updated_at)
  SELECT 1, key, value, updated_at FROM settings;
DROP TABLE settings;
ALTER TABLE settings_new RENAME TO settings;
CREATE INDEX idx_settings_shop ON settings(shop_id);
