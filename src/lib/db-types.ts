import type { Generated, ColumnType } from "kysely";

type TimestampString = string;

export interface ShopsTable {
  id: Generated<number>;
  name: string;
  is_active: ColumnType<number, number | undefined, number>;
  created_at: ColumnType<TimestampString, string | undefined, string>;
}

export interface EmployeesTable {
  id: Generated<number>;
  shop_id: number;
  full_name: string;
  phone: string | null;
  national_id_number: string | null;
  national_id_type: string | null;
  date_of_birth: string | null;
  gender: string | null;
  marital_status: string | null;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relation: string | null;
  position: string | null;
  hire_date: string | null;
  termination_date: string | null;
  basic_salary: ColumnType<number, number | undefined, number>;
  username: string | null;
  password_hash: string | null;
  role: ColumnType<"owner" | "employee", "owner" | "employee" | undefined, "owner" | "employee">;
  is_active: ColumnType<number, number | undefined, number>;
  onboarding_status: ColumnType<"incomplete" | "complete", "incomplete" | "complete" | undefined, "incomplete" | "complete">;
  created_at: ColumnType<TimestampString, string | undefined, string>;
  updated_at: ColumnType<TimestampString, string | undefined, string>;
}

export interface GuarantorsTable {
  id: Generated<number>;
  shop_id: number;
  employee_id: number;
  full_name: string;
  phone: string | null;
  address: string | null;
  relation_to_employee: string | null;
  national_id_number: string | null;
  national_id_type: string | null;
  occupation: string | null;
  workplace: string | null;
  notes: string | null;
  created_at: ColumnType<TimestampString, string | undefined, string>;
  updated_at: ColumnType<TimestampString, string | undefined, string>;
}

export interface AttachmentsTable {
  id: Generated<number>;
  shop_id: number;
  owner_type: "employee" | "guarantor";
  owner_id: number;
  kind: "profile_photo" | "id_front" | "id_back" | "contract" | "guarantor_letter" | "other";
  filename: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: ColumnType<TimestampString, string | undefined, string>;
  uploaded_by: number | null;
  thumbnail: string | null;
}

export interface MenuItemsTable {
  id: Generated<number>;
  shop_id: number;
  name: string;
  price: ColumnType<number, number | undefined, number>;
  sort_order: ColumnType<number, number | undefined, number>;
  is_active: ColumnType<number, number | undefined, number>;
  token_color: string | null;
  created_at: ColumnType<TimestampString, string | undefined, string>;
  updated_at: ColumnType<TimestampString, string | undefined, string>;
}

export interface SalesSessionsTable {
  id: Generated<number>;
  shop_id: number;
  employee_id: number;
  business_date: string;
  shift: string | null;
  cash_amount: ColumnType<number, number | undefined, number>;
  bank_transfer_amount: ColumnType<number, number | undefined, number>;
  notes: string | null;
  status: ColumnType<"open" | "closed", "open" | "closed" | undefined, "open" | "closed">;
  created_at: ColumnType<TimestampString, string | undefined, string>;
  updated_at: ColumnType<TimestampString, string | undefined, string>;
}

export interface SaleLineItemsTable {
  id: Generated<number>;
  shop_id: number;
  sales_session_id: number;
  menu_item_id: number;
  qty: ColumnType<number, number | undefined, number>;
  unit_price_snapshot: number;
  total: number;
  remark: string | null;
  created_at: ColumnType<TimestampString, string | undefined, string>;
  updated_at: ColumnType<TimestampString, string | undefined, string>;
}

export interface PurchaseRequisitionsTable {
  id: Generated<number>;
  shop_id: number;
  purchase_date: string;
  description: string;
  unit: string | null;
  qty: ColumnType<number, number | undefined, number>;
  unit_price: ColumnType<number, number | undefined, number>;
  total: ColumnType<number, number | undefined, number>;
  remark: string | null;
  entered_by: number | null;
  created_at: ColumnType<TimestampString, string | undefined, string>;
  updated_at: ColumnType<TimestampString, string | undefined, string>;
}

export interface PettyCashEntriesTable {
  id: Generated<number>;
  shop_id: number;
  entry_date: string;
  description: string;
  payer_name: string | null;
  amount: ColumnType<number, number | undefined, number>;
  type: "expense" | "refund" | "replenishment";
  remark: string | null;
  entered_by: number | null;
  created_at: ColumnType<TimestampString, string | undefined, string>;
  updated_at: ColumnType<TimestampString, string | undefined, string>;
}

export interface PayrollRunsTable {
  id: Generated<number>;
  shop_id: number;
  year: number;
  month: number;
  status: ColumnType<"draft" | "approved", "draft" | "approved" | undefined, "draft" | "approved">;
  prepared_by: number | null;
  approved_by: number | null;
  created_at: ColumnType<TimestampString, string | undefined, string>;
  updated_at: ColumnType<TimestampString, string | undefined, string>;
}

export interface PayrollEntriesTable {
  id: Generated<number>;
  shop_id: number;
  payroll_run_id: number;
  employee_id: number;
  days_worked: ColumnType<number, number | undefined, number>;
  basic_salary: ColumnType<number, number | undefined, number>;
  pension_employer_pct: ColumnType<number, number | undefined, number>;
  pension_employee_pct: ColumnType<number, number | undefined, number>;
  pension_employer_amount: ColumnType<number, number | undefined, number>;
  pension_employee_amount: ColumnType<number, number | undefined, number>;
  gross_salary: ColumnType<number, number | undefined, number>;
  income_tax: ColumnType<number, number | undefined, number>;
  advance_salary: ColumnType<number, number | undefined, number>;
  bonus: ColumnType<number, number | undefined, number>;
  penalty: ColumnType<number, number | undefined, number>;
  total_deduction: ColumnType<number, number | undefined, number>;
  net_payment: ColumnType<number, number | undefined, number>;
  signed_at: string | null;
  created_at: ColumnType<TimestampString, string | undefined, string>;
  updated_at: ColumnType<TimestampString, string | undefined, string>;
}

// Settings has a composite (shop_id, key) primary key — no synthetic id.
export interface SettingsTable {
  shop_id: number;
  key: string;
  value: string;
  updated_at: ColumnType<TimestampString, string | undefined, string>;
}

export interface AuditLogTable {
  id: Generated<number>;
  shop_id: number;
  actor_id: number | null;
  action: string;
  entity: string;
  entity_id: number | null;
  at: ColumnType<TimestampString, string | undefined, string>;
}

export interface SchemaMigrationsTable {
  filename: string;
  applied_at: ColumnType<TimestampString, string | undefined, string>;
}

export interface DB {
  shops: ShopsTable;
  employees: EmployeesTable;
  guarantors: GuarantorsTable;
  attachments: AttachmentsTable;
  menu_items: MenuItemsTable;
  sales_sessions: SalesSessionsTable;
  sale_line_items: SaleLineItemsTable;
  purchase_requisitions: PurchaseRequisitionsTable;
  petty_cash_entries: PettyCashEntriesTable;
  payroll_runs: PayrollRunsTable;
  payroll_entries: PayrollEntriesTable;
  settings: SettingsTable;
  audit_log: AuditLogTable;
  schema_migrations: SchemaMigrationsTable;
}
