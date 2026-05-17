-- 1) shops table
CREATE TABLE shops (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
);

-- 2) Insert "Sample Shop" with id=1 so existing data has somewhere to belong.
INSERT INTO shops (id, name) VALUES (1, 'Sample Shop');
SELECT setval('shops_id_seq', GREATEST((SELECT MAX(id) FROM shops), 1));

-- 3) Add shop_id to every data table. Default 1 so existing rows belong to
--    Sample Shop; then drop the default so future inserts must specify it.
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

-- Drop the defaults so future inserts must be explicit
ALTER TABLE employees             ALTER COLUMN shop_id DROP DEFAULT;
ALTER TABLE guarantors            ALTER COLUMN shop_id DROP DEFAULT;
ALTER TABLE attachments           ALTER COLUMN shop_id DROP DEFAULT;
ALTER TABLE menu_items            ALTER COLUMN shop_id DROP DEFAULT;
ALTER TABLE sales_sessions        ALTER COLUMN shop_id DROP DEFAULT;
ALTER TABLE sale_line_items       ALTER COLUMN shop_id DROP DEFAULT;
ALTER TABLE purchase_requisitions ALTER COLUMN shop_id DROP DEFAULT;
ALTER TABLE petty_cash_entries    ALTER COLUMN shop_id DROP DEFAULT;
ALTER TABLE payroll_runs          ALTER COLUMN shop_id DROP DEFAULT;
ALTER TABLE payroll_entries       ALTER COLUMN shop_id DROP DEFAULT;
ALTER TABLE audit_log             ALTER COLUMN shop_id DROP DEFAULT;

-- 4) Indexes — every query filters by shop_id first
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

-- 5) Username should be unique PER SHOP, not globally
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_username_key;
CREATE UNIQUE INDEX idx_employees_username_per_shop ON employees(shop_id, username) WHERE username IS NOT NULL;

-- 6) Settings: drop the global PK, make it (shop_id, key)
ALTER TABLE settings DROP CONSTRAINT settings_pkey;
ALTER TABLE settings ADD COLUMN shop_id INTEGER NOT NULL DEFAULT 1 REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE settings ALTER COLUMN shop_id DROP DEFAULT;
ALTER TABLE settings ADD PRIMARY KEY (shop_id, key);
CREATE INDEX idx_settings_shop ON settings(shop_id);

-- 7) RLS as defense in depth. The service role bypasses RLS for app queries,
--    so this protects against anon-key misuse, future Edge Functions, and
--    accidental SQL run from the Supabase dashboard while logged in as a
--    non-service role. We use a session GUC `app.current_shop_id` that the
--    app sets via SET LOCAL at transaction start.
ALTER TABLE shops                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees              ENABLE ROW LEVEL SECURITY;
ALTER TABLE guarantors             ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items             ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_sessions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_line_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_requisitions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE petty_cash_entries     ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_runs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_entries        ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log              ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings               ENABLE ROW LEVEL SECURITY;

-- The service role (what our app connects as) bypasses RLS by default
-- in Supabase. These policies kick in only if anon/authenticated roles
-- ever attempt direct access.
CREATE POLICY tenant_isolation_employees             ON employees             FOR ALL USING (shop_id = current_setting('app.current_shop_id', true)::int);
CREATE POLICY tenant_isolation_guarantors            ON guarantors            FOR ALL USING (shop_id = current_setting('app.current_shop_id', true)::int);
CREATE POLICY tenant_isolation_attachments           ON attachments           FOR ALL USING (shop_id = current_setting('app.current_shop_id', true)::int);
CREATE POLICY tenant_isolation_menu_items            ON menu_items            FOR ALL USING (shop_id = current_setting('app.current_shop_id', true)::int);
CREATE POLICY tenant_isolation_sales_sessions        ON sales_sessions        FOR ALL USING (shop_id = current_setting('app.current_shop_id', true)::int);
CREATE POLICY tenant_isolation_sale_line_items       ON sale_line_items       FOR ALL USING (shop_id = current_setting('app.current_shop_id', true)::int);
CREATE POLICY tenant_isolation_purchase_requisitions ON purchase_requisitions FOR ALL USING (shop_id = current_setting('app.current_shop_id', true)::int);
CREATE POLICY tenant_isolation_petty_cash_entries    ON petty_cash_entries    FOR ALL USING (shop_id = current_setting('app.current_shop_id', true)::int);
CREATE POLICY tenant_isolation_payroll_runs          ON payroll_runs          FOR ALL USING (shop_id = current_setting('app.current_shop_id', true)::int);
CREATE POLICY tenant_isolation_payroll_entries       ON payroll_entries       FOR ALL USING (shop_id = current_setting('app.current_shop_id', true)::int);
CREATE POLICY tenant_isolation_audit_log             ON audit_log             FOR ALL USING (shop_id = current_setting('app.current_shop_id', true)::int);
CREATE POLICY tenant_isolation_settings              ON settings              FOR ALL USING (shop_id = current_setting('app.current_shop_id', true)::int);
