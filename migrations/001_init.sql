-- Employees + HR
CREATE TABLE employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  phone TEXT,
  national_id_number TEXT,
  national_id_type TEXT,
  date_of_birth TEXT,
  gender TEXT,
  marital_status TEXT,
  address TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  emergency_contact_relation TEXT,
  position TEXT,
  hire_date TEXT,
  termination_date TEXT,
  basic_salary INTEGER NOT NULL DEFAULT 0,
  username TEXT UNIQUE,
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('owner','employee')),
  is_active INTEGER NOT NULL DEFAULT 1,
  onboarding_status TEXT NOT NULL DEFAULT 'incomplete' CHECK (onboarding_status IN ('incomplete','complete')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_employees_username ON employees(username);
CREATE INDEX idx_employees_active ON employees(is_active);

CREATE TABLE guarantors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  relation_to_employee TEXT,
  national_id_number TEXT,
  national_id_type TEXT,
  occupation TEXT,
  workplace TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_guarantors_employee ON guarantors(employee_id);

CREATE TABLE attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('employee','guarantor')),
  owner_id INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('profile_photo','id_front','id_back','contract','guarantor_letter','other')),
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
  uploaded_by INTEGER REFERENCES employees(id)
);
CREATE INDEX idx_attachments_owner ON attachments(owner_type, owner_id);

-- Menu
CREATE TABLE menu_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  price INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_menu_active_sort ON menu_items(is_active, sort_order);

-- Sales
CREATE TABLE sales_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  business_date TEXT NOT NULL,
  shift TEXT,
  cash_amount INTEGER NOT NULL DEFAULT 0,
  bank_transfer_amount INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sales_date ON sales_sessions(business_date);
CREATE INDEX idx_sales_employee_date ON sales_sessions(employee_id, business_date);

CREATE TABLE sale_line_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sales_session_id INTEGER NOT NULL REFERENCES sales_sessions(id) ON DELETE CASCADE,
  menu_item_id INTEGER NOT NULL REFERENCES menu_items(id),
  qty INTEGER NOT NULL DEFAULT 0,
  unit_price_snapshot INTEGER NOT NULL,
  total INTEGER NOT NULL,
  remark TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sale_lines_session ON sale_line_items(sales_session_id);

-- Purchases
CREATE TABLE purchase_requisitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_date TEXT NOT NULL,
  description TEXT NOT NULL,
  unit TEXT,
  qty REAL NOT NULL DEFAULT 0,
  unit_price INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  remark TEXT,
  entered_by INTEGER REFERENCES employees(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_purchases_date ON purchase_requisitions(purchase_date);

-- Petty cash
CREATE TABLE petty_cash_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_date TEXT NOT NULL,
  description TEXT NOT NULL,
  payer_name TEXT,
  amount INTEGER NOT NULL DEFAULT 0,
  type TEXT NOT NULL CHECK (type IN ('expense','refund','replenishment')),
  remark TEXT,
  entered_by INTEGER REFERENCES employees(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_petty_date ON petty_cash_entries(entry_date);

-- Payroll
CREATE TABLE payroll_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved')),
  prepared_by INTEGER REFERENCES employees(id),
  approved_by INTEGER REFERENCES employees(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (year, month)
);

CREATE TABLE payroll_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payroll_run_id INTEGER NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  days_worked REAL NOT NULL DEFAULT 0,
  basic_salary INTEGER NOT NULL DEFAULT 0,
  pension_employer_pct REAL NOT NULL DEFAULT 0,
  pension_employee_pct REAL NOT NULL DEFAULT 0,
  pension_employer_amount INTEGER NOT NULL DEFAULT 0,
  pension_employee_amount INTEGER NOT NULL DEFAULT 0,
  gross_salary INTEGER NOT NULL DEFAULT 0,
  income_tax INTEGER NOT NULL DEFAULT 0,
  advance_salary INTEGER NOT NULL DEFAULT 0,
  total_deduction INTEGER NOT NULL DEFAULT 0,
  net_payment INTEGER NOT NULL DEFAULT 0,
  signed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (payroll_run_id, employee_id)
);

-- Settings (key/value)
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Audit log
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER REFERENCES employees(id),
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id INTEGER,
  at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_audit_at ON audit_log(at);
CREATE INDEX idx_audit_entity ON audit_log(entity, entity_id);
