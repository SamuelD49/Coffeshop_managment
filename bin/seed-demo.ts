/**
 * Demo seed. Wipes the current DB, runs migrations from scratch, and inserts
 * realistic-looking content so a customer sees a working shop the moment they
 * open the app:
 *
 *   - 1 owner + 2 cashiers, all with password "demo123"
 *   - 27 menu items matching the paper Daily Sales Income form
 *   - Last 14 days of sales (one shift per cashier per day, weighted item mix)
 *   - 30 days of purchases (beans, milk, sugar, cleaning supplies)
 *   - 30 days of petty cash movements
 *   - One approved payroll run for last month
 *
 * Run via:  npm run seed:demo
 */
import { unlinkSync, existsSync } from "fs";
import { resolve } from "path";
import bcrypt from "bcrypt";

const DB_PATH = process.env.DB_PATH ?? resolve(process.cwd(), "data/shop.db");

// Blow away the existing DB so re-runs are deterministic.
for (const f of [DB_PATH, DB_PATH + "-shm", DB_PATH + "-wal"]) {
  if (existsSync(f)) unlinkSync(f);
}

// Dynamic imports so the DB module reads the wiped-and-recreated file.
import("../src/lib/db").then(async db => {
  db.runMigrations();

  const Employees = await import("../src/models/employees");
  const Settings  = await import("../src/models/settings");
  const Menu      = await import("../src/models/menuItems");
  const Sessions  = await import("../src/models/salesSessions");
  const Lines     = await import("../src/models/saleLineItems");
  const Purchases = await import("../src/models/purchases");
  const Petty     = await import("../src/models/pettyCash");
  const Runs      = await import("../src/models/payrollRuns");
  const Entries   = await import("../src/models/payrollEntries");

  console.log("seeding demo data…");

  // ── Shop identity ────────────────────────────────────────────────────
  Settings.set("shop_name", "Buna Counter");
  Settings.set("currency_code", "ETB");
  Settings.set("currency_symbol", "Br");
  Settings.set("require_complete_hr_before_payroll", "false");

  // ── Employees ────────────────────────────────────────────────────────
  const hash = await bcrypt.hash("demo123", 12);
  const owner = Employees.create({
    full_name: "Solomon Tesfaye",
    username: "owner",
    password_hash: hash,
    role: "owner",
  });
  Employees.updateEmployment(owner.id, {
    position: "Owner", hire_date: "2024-01-01", basic_salary: 1200000,
    role: "owner", is_active: true, username: "owner",
  });

  const almaz = Employees.create({
    full_name: "Almaz Bekele", username: "almaz", password_hash: hash, role: "employee",
  });
  Employees.updateEmployment(almaz.id, {
    position: "Barista", hire_date: "2024-08-15", basic_salary: 550000,
    role: "employee", is_active: true, username: "almaz",
  });

  const hanna = Employees.create({
    full_name: "Hanna Mekonnen", username: "hanna", password_hash: hash, role: "employee",
  });
  Employees.updateEmployment(hanna.id, {
    position: "Cashier", hire_date: "2025-02-01", basic_salary: 480000,
    role: "employee", is_active: true, username: "hanna",
  });

  // ── Menu (the 27 items from the paper Daily Sales Income form) ───────
  const PALETTE = ["#C75D34", "#5C7558", "#B68A3C", "#8B2A26", "#3E2A1F", "#9E4524", "#7A6E62"];
  const menu = [
    { name: "Coffee",            price: 3500 },
    { name: "Macchiato",         price: 4500 },
    { name: "Espresso",          price: 3000 },
    { name: "Espress",           price: 3000 },
    { name: "Milk Safi",         price: 4000 },
    { name: "Milk with coffee",  price: 4500 },
    { name: "Tea",               price: 2500 },
    { name: "Special tea",       price: 3500 },
    { name: "Ginger tea",        price: 3500 },
    { name: "Americano",         price: 4000 },
    { name: "English cake",      price: 8000 },
    { name: "Flavor tea",        price: 4000 },
    { name: "Peanut tea",        price: 4500 },
    { name: "Latte",             price: 6000 },
    { name: "Hot chocolate",     price: 7000 },
    { name: "Hot mocha",         price: 7500 },
    { name: "Cappuccino",        price: 5500 },
    { name: "Caramel macchiato", price: 8500 },
    { name: "Ice coffee",        price: 6500 },
    { name: "Iced coffee",       price: 6500 },
    { name: "Iced latte",        price: 7000 },
    { name: "Iced caramel",      price: 9000 },
    { name: "Iced mocha",        price: 8500 },
    { name: "Water 1/2 L",       price: 2000 },
    { name: "Soft Drinks",       price: 3500 },
    { name: "Roasted coffee 1/2 kg", price: 35000 },
    { name: "Roasted coffee 1 kg",   price: 65000 },
  ];
  const menuRows = menu.map((m, i) => Menu.create({
    name: m.name,
    price: m.price,
    token_color: i % 5 === 0 ? PALETTE[i % PALETTE.length] : null, // mix of auto + chosen
  }));

  // ── Sales: last 14 days, both cashiers, weighted mix ─────────────────
  // The first 10 items get higher weight (sold more often), tail items rarer.
  function pickQty(itemIndex: number): number {
    const weight = itemIndex < 5 ? 0.85 : itemIndex < 10 ? 0.55 : itemIndex < 18 ? 0.25 : 0.10;
    if (Math.random() > weight) return 0;
    const maxQty = itemIndex < 5 ? 14 : itemIndex < 10 ? 8 : 4;
    return Math.max(1, Math.floor(Math.random() * maxQty) + 1);
  }
  function dateNDaysAgo(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }

  let sessionCount = 0;
  for (let day = 13; day >= 0; day--) {
    const date = dateNDaysAgo(day);
    for (const cashier of [almaz, hanna]) {
      const s = Sessions.create({
        employee_id: cashier.id,
        business_date: date,
        shift: day % 2 === 0 ? "morning" : "evening",
      });
      let subtotal = 0;
      menuRows.forEach((m, i) => {
        const qty = pickQty(i);
        if (qty > 0) {
          Lines.upsert(s.id, m.id, qty);
          subtotal += qty * m.price;
        }
      });
      // Cash collected = subtotal ± small random variance to seed "Difference"
      const variance = Math.floor((Math.random() - 0.5) * 1000); // ±500 cents
      const cash = Math.floor(subtotal * 0.75) + variance;
      const bank = Math.floor(subtotal * 0.25);
      Sessions.updateHeader(s.id, { cash_amount: cash, bank_transfer_amount: bank, notes: null });
      // Close all but today's last shift so there's at least one "open" record.
      if (!(day === 0 && cashier.id === hanna.id)) Sessions.close(s.id);
      sessionCount++;
    }
  }

  // ── Purchases ────────────────────────────────────────────────────────
  const purchases = [
    { description: "Roasted beans (premium)", unit: "kg", qty: 5,  unit_price: 80000, remark: "from Sidamo supplier" },
    { description: "Milk",                    unit: "L",  qty: 20, unit_price: 5500,  remark: null },
    { description: "Sugar",                   unit: "kg", qty: 10, unit_price: 6000,  remark: null },
    { description: "Paper cups (small)",      unit: "pcs",qty: 500,unit_price: 200,   remark: "200 small + 300 medium next time" },
    { description: "Cleaning supplies",       unit: null, qty: 1,  unit_price: 15000, remark: "soap + sponges" },
    { description: "Coffee filters",          unit: "pcs",qty: 200,unit_price: 80,    remark: null },
    { description: "Tea bags",                unit: "box",qty: 4,  unit_price: 12000, remark: "English breakfast + ginger" },
    { description: "Pastry flour",            unit: "kg", qty: 5,  unit_price: 9500,  remark: null },
  ];
  for (let i = 0; i < purchases.length; i++) {
    const p = purchases[i];
    Purchases.create({
      purchase_date: dateNDaysAgo(Math.floor(Math.random() * 28)),
      description: p.description,
      unit: p.unit ?? null,
      qty: p.qty,
      unit_price: p.unit_price,
      remark: p.remark ?? null,
      entered_by: owner.id,
    });
  }

  // ── Petty cash ───────────────────────────────────────────────────────
  Petty.create({ entry_date: dateNDaysAgo(28), description: "Initial cash float",  payer_name: "Solomon", amount: 200000, type: "replenishment", remark: null, entered_by: owner.id });
  const pettyMovements = [
    { description: "Taxi for supply run",      amount: 5500,  type: "expense"      as const },
    { description: "Light bulbs",              amount: 4500,  type: "expense"      as const },
    { description: "Daily newspaper",          amount: 2000,  type: "expense"      as const },
    { description: "Plumber call-out",         amount: 35000, type: "expense"      as const },
    { description: "Refund — overpaid taxi",   amount: 1500,  type: "refund"       as const },
    { description: "Snacks for staff",         amount: 8000,  type: "expense"      as const },
    { description: "Air freshener",            amount: 3500,  type: "expense"      as const },
    { description: "Cash top-up",              amount: 100000,type: "replenishment" as const },
    { description: "Bin liners",               amount: 4000,  type: "expense"      as const },
    { description: "Birthday cake (Almaz)",    amount: 25000, type: "expense"      as const },
  ];
  pettyMovements.forEach((m, i) => {
    Petty.create({
      entry_date: dateNDaysAgo(20 - Math.floor(i * 1.8)),
      description: m.description,
      payer_name: i % 3 === 0 ? "Solomon" : (i % 3 === 1 ? "Almaz" : null),
      amount: m.amount,
      type: m.type,
      remark: null,
      entered_by: owner.id,
    });
  });

  // ── Payroll run: last completed month, approved ──────────────────────
  const today = new Date();
  const lastMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const py = lastMonthDate.getFullYear();
  const pm = lastMonthDate.getMonth() + 1;

  const run = Runs.create({ year: py, month: pm, prepared_by: owner.id });
  for (const cashier of [almaz, hanna]) {
    const emp = Employees.findFull(cashier.id)!;
    Entries.createFromEmployee({
      run_id: run.id,
      employee_id: cashier.id,
      basic_salary: emp.basic_salary,
      days_worked: 30,
      standard_days_in_month: 30,
      pension_employer_pct: 11,
      pension_employee_pct: 7,
      income_tax: Math.round(emp.basic_salary * 0.10),
      advance_salary: 0,
      bonus: cashier.id === almaz.id ? 50000 : 0,        // Almaz got a bonus
      penalty: cashier.id === hanna.id ? 15000 : 0,       // Hanna got a small penalty
    });
  }
  Runs.approve(run.id, owner.id);

  console.log(`✓ Seeded ${sessionCount} sales sessions across 14 days`);
  console.log(`✓ Menu has ${menuRows.length} items`);
  console.log(`✓ Payroll run created for ${py}-${String(pm).padStart(2, "0")} and approved`);
  console.log("");
  console.log("Login credentials (all passwords: demo123):");
  console.log("  Owner:    owner");
  console.log("  Cashier:  almaz");
  console.log("  Cashier:  hanna");

  db.closeDb();
});
