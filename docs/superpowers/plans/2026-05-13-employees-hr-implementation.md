# Plan 2 — Employees & HR Implementation Plan

> **For agentic workers:** Use the same per-task subagent dispatch pattern that ran Plan 1. Each task is bite-sized and ends in a commit.

**Goal:** Replace the Plan 1 stub `/employees` link with a complete HR onboarding flow. Owner can add an employee, fill out personal info, upload profile photo + ID front + ID back + signed contract, add one or more guarantors (each with their info + ID copies), and mark the record complete. Employees list shows a status badge per row. Payroll (Plan 5) consumes the `onboarding_status` field.

**Architecture:** Builds on Plan 1's foundation. New deps: `multer` (file uploads), `sharp` (image thumbnails). Files live on disk under `/data/uploads/{owner_type}/{owner_id}/`. The `employees`, `guarantors`, and `attachments` tables already exist (migration 001). Onboarding completeness is a pure function in `src/lib/onboarding.ts` — no schema change needed.

**Tech additions to package.json:** `multer`, `sharp`, `@types/multer`.

**Design system rules from Plan 1 still apply.** Read [`docs/superpowers/specs/2026-05-12-design-system.md`](../specs/2026-05-12-design-system.md) before any view/CSS task. Use `.card`, `.btn-primary`, `.field-*`, `.pip-*`, etc.

---

## File map

```
src/
├── lib/
│   ├── uploads.ts          # NEW: multer config + sharp thumbnailer
│   └── onboarding.ts       # NEW: completeness calculator
├── models/
│   ├── employees.ts        # EXTEND: add list, findFull, updatePersonal, updateEmployment, listAll
│   ├── guarantors.ts       # NEW
│   └── attachments.ts      # NEW (polymorphic)
├── controllers/
│   └── employeesController.ts  # NEW (replaces routes/index.ts stub)
├── routes/
│   └── employees.ts        # NEW (mounted under /employees in routes/index.ts)
└── views/
    └── employees/
        ├── list.ejs
        ├── new.ejs
        ├── profile.ejs         # shell with tab nav
        ├── _personal.ejs       # tab 1 partial
        ├── _documents.ejs      # tab 2 partial
        ├── _guarantors.ejs     # tab 3 partial
        ├── _employment.ejs     # tab 4 partial
        └── _payroll.ejs        # tab 5 placeholder
```

```
data/
└── uploads/
    ├── employee/{id}/{filename}
    └── guarantor/{id}/{filename}
```

---

## Task 1: Install multer + sharp, add uploads helper

**Files:** `package.json`, `src/lib/uploads.ts`

- [ ] **Step 1: Install deps**

```bash
npm install multer sharp
npm install -D @types/multer
```

- [ ] **Step 2: Create `src/lib/uploads.ts`**

```ts
import multer from "multer";
import sharp from "sharp";
import { mkdirSync, existsSync } from "fs";
import { resolve, join, extname } from "path";
import { randomBytes } from "crypto";

const UPLOADS_ROOT = resolve(process.cwd(), "data/uploads");

export type OwnerType = "employee" | "guarantor";

function ownerDir(ownerType: OwnerType, ownerId: number): string {
  const dir = join(UPLOADS_ROOT, ownerType, String(ownerId));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function uploadsRoot(): string {
  return UPLOADS_ROOT;
}

export function pathFor(ownerType: OwnerType, ownerId: number, filename: string): string {
  return join(ownerDir(ownerType, ownerId), filename);
}

// Multer instance: memory storage, 5MB limit, image+pdf only.
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(png|jpe?g|webp|gif)$|^application\/pdf$/.test(file.mimetype);
    cb(ok ? null : new Error("Only PNG/JPG/WEBP/GIF/PDF allowed"), ok);
  },
});

export type StoredFile = {
  filename: string;
  thumbnail: string | null;
  size: number;
  mime: string;
};

// Persist a multer file to disk under owner_type/owner_id/. For images, also
// write a 240px-wide WebP thumbnail named `thumb_<basename>.webp`.
export async function storeFile(
  ownerType: OwnerType,
  ownerId: number,
  file: Express.Multer.File,
): Promise<StoredFile> {
  const ext = (extname(file.originalname) || "").toLowerCase() || mimeExt(file.mimetype);
  const slug = randomBytes(8).toString("hex");
  const filename = `${slug}${ext}`;
  const fullPath = pathFor(ownerType, ownerId, filename);

  if (file.mimetype.startsWith("image/")) {
    // Strip metadata, re-encode in original format (sharp handles png/jpg/webp/gif inputs)
    await sharp(file.buffer).rotate().toFile(fullPath);
    const thumbName = `thumb_${slug}.webp`;
    await sharp(file.buffer).rotate().resize({ width: 240, withoutEnlargement: true }).webp({ quality: 78 }).toFile(pathFor(ownerType, ownerId, thumbName));
    return { filename, thumbnail: thumbName, size: file.size, mime: file.mimetype };
  } else {
    // PDF — write raw buffer
    const fs = await import("fs/promises");
    await fs.writeFile(fullPath, file.buffer);
    return { filename, thumbnail: null, size: file.size, mime: file.mimetype };
  }
}

function mimeExt(mime: string): string {
  switch (mime) {
    case "image/png":  return ".png";
    case "image/jpeg": return ".jpg";
    case "image/webp": return ".webp";
    case "image/gif":  return ".gif";
    case "application/pdf": return ".pdf";
    default: return "";
  }
}

export async function deleteFile(ownerType: OwnerType, ownerId: number, filename: string, thumbnail: string | null): Promise<void> {
  const fs = await import("fs/promises");
  await Promise.allSettled([
    fs.unlink(pathFor(ownerType, ownerId, filename)),
    thumbnail ? fs.unlink(pathFor(ownerType, ownerId, thumbnail)) : Promise.resolve(),
  ]);
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: clean tsc exit.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/lib/uploads.ts
git commit -m "feat(lib): multer + sharp uploads helper"
```

---

## Task 2: Extend employees model with full HR surface (TDD)

**Files:** `src/models/employees.ts`, `tests/models/employees.test.ts`

Add new functions: `listAll`, `findFull` (returns all columns, not just auth subset), `updatePersonal`, `updateEmployment`, `setOnboardingStatus`. Existing functions (`count`, `findByUsername`, `findById`, `create`, `updatePassword`, `setActive`) stay unchanged.

- [ ] **Step 1: Add tests to `tests/models/employees.test.ts`**

Append (do not replace existing tests):

```ts
describe("Employees full HR surface", () => {
  it("listAll() returns rows ordered by full_name", () => {
    Employees.create({ full_name: "Bekele", username: "bek", password_hash: "h", role: "employee" });
    Employees.create({ full_name: "Almaz",  username: "alm", password_hash: "h", role: "employee" });
    const all = Employees.listAll();
    expect(all.map(e => e.full_name)).toEqual(["Almaz", "Bekele"]);
  });

  it("listAll() excludes inactive when activeOnly=true", () => {
    const a = Employees.create({ full_name: "Almaz",  username: "alm", password_hash: "h", role: "employee" });
    Employees.setActive(a.id, false);
    Employees.create({ full_name: "Bekele", username: "bek", password_hash: "h", role: "employee" });
    expect(Employees.listAll({ activeOnly: true }).map(e => e.full_name)).toEqual(["Bekele"]);
    expect(Employees.listAll({ activeOnly: false })).toHaveLength(2);
  });

  it("findFull() returns every column including HR fields", () => {
    const e = Employees.create({ full_name: "Almaz", username: "alm", password_hash: "h", role: "employee" });
    const full = Employees.findFull(e.id);
    expect(full?.full_name).toBe("Almaz");
    expect("national_id_number" in (full ?? {})).toBe(true);
    expect("hire_date" in (full ?? {})).toBe(true);
  });

  it("updatePersonal() persists personal fields", () => {
    const e = Employees.create({ full_name: "Almaz", username: "alm", password_hash: "h", role: "employee" });
    Employees.updatePersonal(e.id, {
      full_name: "Almaz Tesfaye",
      phone: "+251911234567",
      national_id_number: "ID12345",
      national_id_type: "Kebele",
      date_of_birth: "1995-04-10",
      gender: "F",
      marital_status: "single",
      address: "Bole, Addis Ababa",
      emergency_contact_name: "Hanna",
      emergency_contact_phone: "+251911234568",
      emergency_contact_relation: "Sister",
    });
    const full = Employees.findFull(e.id);
    expect(full?.phone).toBe("+251911234567");
    expect(full?.national_id_number).toBe("ID12345");
    expect(full?.emergency_contact_name).toBe("Hanna");
  });

  it("updateEmployment() persists employment fields", () => {
    const e = Employees.create({ full_name: "Almaz", username: "alm", password_hash: "h", role: "employee" });
    Employees.updateEmployment(e.id, {
      position: "Barista",
      hire_date: "2025-06-01",
      basic_salary: 350000, // cents
      role: "employee",
      is_active: true,
    });
    const full = Employees.findFull(e.id);
    expect(full?.position).toBe("Barista");
    expect(full?.hire_date).toBe("2025-06-01");
    expect(full?.basic_salary).toBe(350000);
  });

  it("setOnboardingStatus() updates the status column", () => {
    const e = Employees.create({ full_name: "Almaz", username: "alm", password_hash: "h", role: "employee" });
    Employees.setOnboardingStatus(e.id, "complete");
    expect(Employees.findFull(e.id)?.onboarding_status).toBe("complete");
  });
});
```

- [ ] **Step 2: Run tests, expect failures**

```bash
npm test -- employees
```

Expected: failures on the new tests because the functions don't exist yet.

- [ ] **Step 3: Extend `src/models/employees.ts`**

Append after the existing exports (don't remove anything):

```ts
export type PersonalInput = {
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
};

export type EmploymentInput = {
  position: string | null;
  hire_date: string | null;
  termination_date?: string | null;
  basic_salary: number;
  role: "owner" | "employee";
  is_active: boolean;
  username?: string | null;
};

export function listAll(opts: { activeOnly?: boolean } = {}): Employee[] {
  const where = opts.activeOnly ? "WHERE is_active = 1" : "";
  return getDb().prepare(`SELECT * FROM employees ${where} ORDER BY full_name`).all() as Employee[];
}

export function findFull(id: number): Employee | null {
  const row = getDb().prepare("SELECT * FROM employees WHERE id = ?").get(id) as Employee | undefined;
  return row ?? null;
}

export function updatePersonal(id: number, input: PersonalInput): void {
  getDb().prepare(`
    UPDATE employees SET
      full_name = @full_name,
      phone = @phone,
      national_id_number = @national_id_number,
      national_id_type = @national_id_type,
      date_of_birth = @date_of_birth,
      gender = @gender,
      marital_status = @marital_status,
      address = @address,
      emergency_contact_name = @emergency_contact_name,
      emergency_contact_phone = @emergency_contact_phone,
      emergency_contact_relation = @emergency_contact_relation,
      updated_at = datetime('now')
    WHERE id = @id
  `).run({ ...input, id });
}

export function updateEmployment(id: number, input: EmploymentInput): void {
  getDb().prepare(`
    UPDATE employees SET
      position = @position,
      hire_date = @hire_date,
      termination_date = @termination_date,
      basic_salary = @basic_salary,
      role = @role,
      is_active = @is_active,
      username = @username,
      updated_at = datetime('now')
    WHERE id = @id
  `).run({
    position: input.position,
    hire_date: input.hire_date,
    termination_date: input.termination_date ?? null,
    basic_salary: input.basic_salary,
    role: input.role,
    is_active: input.is_active ? 1 : 0,
    username: input.username ?? null,
    id,
  });
}

export function setOnboardingStatus(id: number, status: "incomplete" | "complete"): void {
  getDb().prepare("UPDATE employees SET onboarding_status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
}
```

Also update the `Employee` type at the top of the file to include the full HR columns:

Replace the existing `Employee` type with:

```ts
export type Employee = {
  id: number;
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
  basic_salary: number;
  username: string | null;
  password_hash: string | null;
  role: "owner" | "employee";
  is_active: number;
  onboarding_status: "incomplete" | "complete";
  created_at: string;
  updated_at: string;
};
```

- [ ] **Step 4: Run tests, expect pass**

```bash
npm test
```

Expected: all green (40 + 5 new employees tests = 45 total).

- [ ] **Step 5: Commit**

```bash
git add src/models/employees.ts tests/models/employees.test.ts
git commit -m "feat(models): employees full HR surface (listAll, findFull, update*)"
```

---

## Task 3: Guarantors model (TDD)

**Files:** `src/models/guarantors.ts`, `tests/models/guarantors.test.ts`

- [ ] **Step 1: Write failing tests `tests/models/guarantors.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { unlinkSync, existsSync } from "fs";
import { closeDb, runMigrations } from "../../src/lib/db";
import * as Employees from "../../src/models/employees";
import * as Guarantors from "../../src/models/guarantors";

const TEST_DB = "./data/test-guarantors.db";
process.env.DB_PATH = TEST_DB;

beforeEach(() => {
  closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  runMigrations();
});

afterAll(() => {
  closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
});

describe("Guarantors", () => {
  it("create() inserts and returns the row", () => {
    const e = Employees.create({ full_name: "Almaz", username: "alm", password_hash: "h", role: "employee" });
    const g = Guarantors.create({
      employee_id: e.id,
      full_name: "Mulu",
      phone: "+251911000111",
      address: "Addis",
      relation_to_employee: "Aunt",
      national_id_number: "G1",
      national_id_type: "Kebele",
      occupation: "Teacher",
      workplace: "Bole School",
      notes: "Stable employment 8 years",
    });
    expect(g.id).toBeGreaterThan(0);
    expect(g.full_name).toBe("Mulu");
    expect(g.employee_id).toBe(e.id);
  });

  it("listForEmployee() returns rows ordered by created_at", () => {
    const e = Employees.create({ full_name: "Almaz", username: "alm", password_hash: "h", role: "employee" });
    Guarantors.create({ employee_id: e.id, full_name: "Mulu", phone: null, address: null, relation_to_employee: null, national_id_number: null, national_id_type: null, occupation: null, workplace: null, notes: null });
    Guarantors.create({ employee_id: e.id, full_name: "Hanna", phone: null, address: null, relation_to_employee: null, national_id_number: null, national_id_type: null, occupation: null, workplace: null, notes: null });
    expect(Guarantors.listForEmployee(e.id).map(g => g.full_name)).toEqual(["Mulu", "Hanna"]);
  });

  it("findById() returns row or null", () => {
    const e = Employees.create({ full_name: "Almaz", username: "alm", password_hash: "h", role: "employee" });
    const g = Guarantors.create({ employee_id: e.id, full_name: "Mulu", phone: null, address: null, relation_to_employee: null, national_id_number: null, national_id_type: null, occupation: null, workplace: null, notes: null });
    expect(Guarantors.findById(g.id)?.full_name).toBe("Mulu");
    expect(Guarantors.findById(999)).toBeNull();
  });

  it("update() persists changes", () => {
    const e = Employees.create({ full_name: "Almaz", username: "alm", password_hash: "h", role: "employee" });
    const g = Guarantors.create({ employee_id: e.id, full_name: "Mulu", phone: null, address: null, relation_to_employee: null, national_id_number: null, national_id_type: null, occupation: null, workplace: null, notes: null });
    Guarantors.update(g.id, { full_name: "Mulu Bekele", phone: "+251911", address: "Bole", relation_to_employee: "Aunt", national_id_number: "G1", national_id_type: "Kebele", occupation: "Teacher", workplace: "Bole School", notes: null });
    expect(Guarantors.findById(g.id)?.full_name).toBe("Mulu Bekele");
    expect(Guarantors.findById(g.id)?.phone).toBe("+251911");
  });

  it("remove() deletes the row", () => {
    const e = Employees.create({ full_name: "Almaz", username: "alm", password_hash: "h", role: "employee" });
    const g = Guarantors.create({ employee_id: e.id, full_name: "Mulu", phone: null, address: null, relation_to_employee: null, national_id_number: null, national_id_type: null, occupation: null, workplace: null, notes: null });
    Guarantors.remove(g.id);
    expect(Guarantors.findById(g.id)).toBeNull();
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
npm test -- guarantors
```

- [ ] **Step 3: Implement `src/models/guarantors.ts`**

```ts
import { getDb } from "../lib/db";

export type Guarantor = {
  id: number;
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
  created_at: string;
  updated_at: string;
};

export type GuarantorInput = Omit<Guarantor, "id" | "created_at" | "updated_at">;

export function create(input: GuarantorInput): Guarantor {
  const r = getDb().prepare(`
    INSERT INTO guarantors (employee_id, full_name, phone, address, relation_to_employee, national_id_number, national_id_type, occupation, workplace, notes)
    VALUES (@employee_id, @full_name, @phone, @address, @relation_to_employee, @national_id_number, @national_id_type, @occupation, @workplace, @notes)
  `).run(input);
  return findById(Number(r.lastInsertRowid))!;
}

export function listForEmployee(employeeId: number): Guarantor[] {
  return getDb().prepare("SELECT * FROM guarantors WHERE employee_id = ? ORDER BY created_at, id").all(employeeId) as Guarantor[];
}

export function findById(id: number): Guarantor | null {
  const r = getDb().prepare("SELECT * FROM guarantors WHERE id = ?").get(id) as Guarantor | undefined;
  return r ?? null;
}

export function update(id: number, input: Omit<GuarantorInput, "employee_id">): void {
  getDb().prepare(`
    UPDATE guarantors SET
      full_name = @full_name,
      phone = @phone,
      address = @address,
      relation_to_employee = @relation_to_employee,
      national_id_number = @national_id_number,
      national_id_type = @national_id_type,
      occupation = @occupation,
      workplace = @workplace,
      notes = @notes,
      updated_at = datetime('now')
    WHERE id = @id
  `).run({ ...input, id });
}

export function remove(id: number): void {
  getDb().prepare("DELETE FROM guarantors WHERE id = ?").run(id);
}
```

- [ ] **Step 4: Run, expect pass; commit**

```bash
npm test
git add src/models/guarantors.ts tests/models/guarantors.test.ts
git commit -m "feat(models): guarantors CRUD"
```

---

## Task 4: Attachments model (polymorphic, TDD)

**Files:** `src/models/attachments.ts`, `tests/models/attachments.test.ts`

- [ ] **Step 1: Write tests `tests/models/attachments.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { unlinkSync, existsSync } from "fs";
import { closeDb, runMigrations } from "../../src/lib/db";
import * as Employees from "../../src/models/employees";
import * as Attachments from "../../src/models/attachments";

const TEST_DB = "./data/test-attachments.db";
process.env.DB_PATH = TEST_DB;

beforeEach(() => {
  closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  runMigrations();
});

afterAll(() => {
  closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
});

describe("Attachments", () => {
  it("create() and findByOwner() round-trip", () => {
    const e = Employees.create({ full_name: "Almaz", username: "alm", password_hash: "h", role: "employee" });
    Attachments.create({ owner_type: "employee", owner_id: e.id, kind: "profile_photo", filename: "abc.png", original_name: "me.png", mime_type: "image/png", size_bytes: 1234, uploaded_by: null });
    Attachments.create({ owner_type: "employee", owner_id: e.id, kind: "id_front", filename: "def.jpg", original_name: "id.jpg", mime_type: "image/jpeg", size_bytes: 5678, uploaded_by: null });
    const list = Attachments.findByOwner("employee", e.id);
    expect(list).toHaveLength(2);
    expect(list.map(a => a.kind).sort()).toEqual(["id_front", "profile_photo"]);
  });

  it("findOneByKind() returns the latest of a kind or null", () => {
    const e = Employees.create({ full_name: "Almaz", username: "alm", password_hash: "h", role: "employee" });
    Attachments.create({ owner_type: "employee", owner_id: e.id, kind: "profile_photo", filename: "old.png", original_name: "old.png", mime_type: "image/png", size_bytes: 1, uploaded_by: null });
    Attachments.create({ owner_type: "employee", owner_id: e.id, kind: "profile_photo", filename: "new.png", original_name: "new.png", mime_type: "image/png", size_bytes: 2, uploaded_by: null });
    expect(Attachments.findOneByKind("employee", e.id, "profile_photo")?.filename).toBe("new.png");
    expect(Attachments.findOneByKind("employee", e.id, "contract")).toBeNull();
  });

  it("remove() deletes by id", () => {
    const e = Employees.create({ full_name: "Almaz", username: "alm", password_hash: "h", role: "employee" });
    const a = Attachments.create({ owner_type: "employee", owner_id: e.id, kind: "id_front", filename: "x.jpg", original_name: "x.jpg", mime_type: "image/jpeg", size_bytes: 1, uploaded_by: null });
    Attachments.remove(a.id);
    expect(Attachments.findByOwner("employee", e.id)).toHaveLength(0);
  });

  it("removeByOwner() bulk-deletes all rows for an owner", () => {
    const e = Employees.create({ full_name: "Almaz", username: "alm", password_hash: "h", role: "employee" });
    Attachments.create({ owner_type: "employee", owner_id: e.id, kind: "id_front",  filename: "a", original_name: "a", mime_type: "image/png", size_bytes: 1, uploaded_by: null });
    Attachments.create({ owner_type: "employee", owner_id: e.id, kind: "id_back",   filename: "b", original_name: "b", mime_type: "image/png", size_bytes: 1, uploaded_by: null });
    Attachments.removeByOwner("employee", e.id);
    expect(Attachments.findByOwner("employee", e.id)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
npm test -- attachments
```

- [ ] **Step 3: Implement `src/models/attachments.ts`**

```ts
import { getDb } from "../lib/db";

export type AttachmentKind = "profile_photo" | "id_front" | "id_back" | "contract" | "guarantor_letter" | "other";
export type OwnerType = "employee" | "guarantor";

export type Attachment = {
  id: number;
  owner_type: OwnerType;
  owner_id: number;
  kind: AttachmentKind;
  filename: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: string;
  uploaded_by: number | null;
};

export type AttachmentInput = Omit<Attachment, "id" | "uploaded_at">;

export function create(input: AttachmentInput): Attachment {
  const r = getDb().prepare(`
    INSERT INTO attachments (owner_type, owner_id, kind, filename, original_name, mime_type, size_bytes, uploaded_by)
    VALUES (@owner_type, @owner_id, @kind, @filename, @original_name, @mime_type, @size_bytes, @uploaded_by)
  `).run(input);
  return findById(Number(r.lastInsertRowid))!;
}

export function findById(id: number): Attachment | null {
  const r = getDb().prepare("SELECT * FROM attachments WHERE id = ?").get(id) as Attachment | undefined;
  return r ?? null;
}

export function findByOwner(ownerType: OwnerType, ownerId: number): Attachment[] {
  return getDb().prepare("SELECT * FROM attachments WHERE owner_type = ? AND owner_id = ? ORDER BY uploaded_at, id").all(ownerType, ownerId) as Attachment[];
}

export function findOneByKind(ownerType: OwnerType, ownerId: number, kind: AttachmentKind): Attachment | null {
  const r = getDb().prepare("SELECT * FROM attachments WHERE owner_type = ? AND owner_id = ? AND kind = ? ORDER BY uploaded_at DESC, id DESC LIMIT 1").get(ownerType, ownerId, kind) as Attachment | undefined;
  return r ?? null;
}

export function remove(id: number): void {
  getDb().prepare("DELETE FROM attachments WHERE id = ?").run(id);
}

export function removeByOwner(ownerType: OwnerType, ownerId: number): void {
  getDb().prepare("DELETE FROM attachments WHERE owner_type = ? AND owner_id = ?").run(ownerType, ownerId);
}
```

- [ ] **Step 4: Run, expect pass; commit**

```bash
npm test
git add src/models/attachments.ts tests/models/attachments.test.ts
git commit -m "feat(models): polymorphic attachments"
```

---

## Task 5: Onboarding completeness calculator (TDD)

**Files:** `src/lib/onboarding.ts`, `tests/onboarding.test.ts`

The rule from the spec: an employee is "complete" when (a) required personal fields filled, (b) profile photo + ID front + ID back + signed contract uploaded, (c) at least 1 guarantor with required fields + guarantor's ID copy.

- [ ] **Step 1: Write tests `tests/onboarding.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { unlinkSync, existsSync } from "fs";
import { closeDb, runMigrations } from "../src/lib/db";
import * as Employees from "../src/models/employees";
import * as Guarantors from "../src/models/guarantors";
import * as Attachments from "../src/models/attachments";
import { calculateCompleteness } from "../src/lib/onboarding";

const TEST_DB = "./data/test-onboarding.db";
process.env.DB_PATH = TEST_DB;

beforeEach(() => {
  closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  runMigrations();
});

afterAll(() => {
  closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
});

function seedEmployee() {
  return Employees.create({ full_name: "Almaz", username: "alm", password_hash: "h", role: "employee" });
}

function fillPersonal(id: number) {
  Employees.updatePersonal(id, {
    full_name: "Almaz",
    phone: "+251911",
    national_id_number: "ID1",
    national_id_type: "Kebele",
    date_of_birth: "1990-01-01",
    gender: "F",
    marital_status: "single",
    address: "Addis",
    emergency_contact_name: "Hanna",
    emergency_contact_phone: "+251912",
    emergency_contact_relation: "Sister",
  });
}

describe("calculateCompleteness", () => {
  it("flags personal-incomplete when fields are missing", () => {
    const e = seedEmployee();
    const r = calculateCompleteness(e.id);
    expect(r.complete).toBe(false);
    expect(r.missing).toContain("phone");
    expect(r.missing).toContain("national_id_number");
    expect(r.missing).toContain("address");
  });

  it("flags missing documents", () => {
    const e = seedEmployee();
    fillPersonal(e.id);
    const r = calculateCompleteness(e.id);
    expect(r.missing).toContain("profile_photo");
    expect(r.missing).toContain("id_front");
    expect(r.missing).toContain("id_back");
    expect(r.missing).toContain("contract");
  });

  it("flags missing guarantor and guarantor id", () => {
    const e = seedEmployee();
    fillPersonal(e.id);
    for (const k of ["profile_photo", "id_front", "id_back", "contract"] as const) {
      Attachments.create({ owner_type: "employee", owner_id: e.id, kind: k, filename: "x", original_name: "x", mime_type: "image/png", size_bytes: 1, uploaded_by: null });
    }
    const r = calculateCompleteness(e.id);
    expect(r.missing).toContain("guarantor");
  });

  it("complete=true when everything present", () => {
    const e = seedEmployee();
    fillPersonal(e.id);
    for (const k of ["profile_photo", "id_front", "id_back", "contract"] as const) {
      Attachments.create({ owner_type: "employee", owner_id: e.id, kind: k, filename: "x", original_name: "x", mime_type: "image/png", size_bytes: 1, uploaded_by: null });
    }
    const g = Guarantors.create({
      employee_id: e.id, full_name: "Mulu", phone: "+251", address: "Addis",
      relation_to_employee: "Aunt", national_id_number: "G1", national_id_type: "Kebele",
      occupation: "T", workplace: "S", notes: null,
    });
    Attachments.create({ owner_type: "guarantor", owner_id: g.id, kind: "id_front", filename: "g", original_name: "g", mime_type: "image/png", size_bytes: 1, uploaded_by: null });
    const r = calculateCompleteness(e.id);
    expect(r.complete).toBe(true);
    expect(r.missing).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
npm test -- onboarding
```

- [ ] **Step 3: Implement `src/lib/onboarding.ts`**

```ts
import * as Employees from "../models/employees";
import * as Guarantors from "../models/guarantors";
import * as Attachments from "../models/attachments";

export type CompletenessResult = {
  complete: boolean;
  missing: string[];
};

const REQUIRED_PERSONAL: Array<keyof import("../models/employees").Employee> = [
  "full_name", "phone", "national_id_number", "national_id_type",
  "date_of_birth", "gender", "address",
  "emergency_contact_name", "emergency_contact_phone",
];

const REQUIRED_DOCS = ["profile_photo", "id_front", "id_back", "contract"] as const;

export function calculateCompleteness(employeeId: number): CompletenessResult {
  const employee = Employees.findFull(employeeId);
  if (!employee) return { complete: false, missing: ["employee_not_found"] };

  const missing: string[] = [];

  for (const field of REQUIRED_PERSONAL) {
    const v = employee[field];
    if (v === null || v === undefined || v === "") missing.push(field as string);
  }

  for (const kind of REQUIRED_DOCS) {
    if (!Attachments.findOneByKind("employee", employeeId, kind)) {
      missing.push(kind);
    }
  }

  const guarantors = Guarantors.listForEmployee(employeeId);
  if (guarantors.length === 0) {
    missing.push("guarantor");
  } else {
    const firstWithId = guarantors.find(g => Attachments.findOneByKind("guarantor", g.id, "id_front") !== null);
    if (!firstWithId) missing.push("guarantor_id");
  }

  return { complete: missing.length === 0, missing };
}
```

- [ ] **Step 4: Run, expect pass; commit**

```bash
npm test
git add src/lib/onboarding.ts tests/onboarding.test.ts
git commit -m "feat(lib): onboarding completeness calculator"
```

---

## Task 6: Employees list page

**Files:** `src/controllers/employeesController.ts`, `src/views/employees/list.ejs`, `src/routes/employees.ts`, `src/routes/index.ts` (modify to mount new router)

- [ ] **Step 1: Create `src/routes/employees.ts`**

```ts
import { Router } from "express";
import * as Ctrl from "../controllers/employeesController";
import { requireAuth } from "../middleware/requireAuth";
import { requireOwner } from "../middleware/requireOwner";
import { upload } from "../lib/uploads";

export const employeesRouter = Router();

employeesRouter.use(requireAuth, requireOwner);

employeesRouter.get("/",        Ctrl.list);
employeesRouter.get("/new",     Ctrl.showNew);
employeesRouter.post("/",       Ctrl.create);
employeesRouter.get("/:id",     Ctrl.profile);

// Tab updates
employeesRouter.post("/:id/personal",   Ctrl.updatePersonal);
employeesRouter.post("/:id/employment", Ctrl.updateEmployment);

// Documents (employee)
employeesRouter.post("/:id/documents",          upload.single("file"), Ctrl.uploadDocument);
employeesRouter.post("/:id/documents/:attId/delete", Ctrl.deleteDocument);

// Guarantors
employeesRouter.post("/:id/guarantors",                       Ctrl.addGuarantor);
employeesRouter.post("/:id/guarantors/:gid",                  Ctrl.updateGuarantor);
employeesRouter.post("/:id/guarantors/:gid/delete",           Ctrl.removeGuarantor);
employeesRouter.post("/:id/guarantors/:gid/documents",        upload.single("file"), Ctrl.uploadGuarantorDocument);
employeesRouter.post("/:id/guarantors/:gid/documents/:attId/delete", Ctrl.deleteGuarantorDocument);

// File serving (auth-gated)
employeesRouter.get("/:id/files/:filename",                 Ctrl.serveEmployeeFile);
employeesRouter.get("/:id/guarantors/:gid/files/:filename", Ctrl.serveGuarantorFile);
```

- [ ] **Step 2: Modify `src/routes/index.ts` to mount employees router**

Add the import at the top:

```ts
import { employeesRouter } from "./employees";
```

And add a mount line after the existing route registrations:

```ts
router.use("/employees", employeesRouter);
```

- [ ] **Step 3: Create `src/controllers/employeesController.ts`** (handlers — many of them are stubs until later tasks fill them in)

```ts
import type { Request, Response } from "express";
import { resolve } from "path";
import * as Employees from "../models/employees";
import * as Guarantors from "../models/guarantors";
import * as Attachments from "../models/attachments";
import { calculateCompleteness } from "../lib/onboarding";
import { writeAudit } from "../lib/audit";
import { pushFlash } from "../lib/flash";
import { pathFor, storeFile, deleteFile } from "../lib/uploads";

function actor(req: Request): number | null { return req.session.employeeId ?? null; }

export function list(req: Request, res: Response) {
  const showInactive = req.query.show === "all";
  const rows = Employees.listAll({ activeOnly: !showInactive });
  const withStatus = rows.map(e => ({
    employee: e,
    completeness: calculateCompleteness(e.id),
  }));
  res.render("employees/list", { employees: withStatus, showInactive });
}

export function showNew(_req: Request, res: Response) {
  res.render("employees/new");
}

export function create(req: Request, res: Response) {
  const { full_name, phone, role } = req.body as Record<string, string>;
  if (!full_name || full_name.trim() === "") {
    pushFlash(req, "error", "Full name is required");
    return res.redirect("/employees/new");
  }
  const safeRole: "owner" | "employee" = role === "owner" ? "owner" : "employee";
  const e = Employees.create({ full_name: full_name.trim(), phone: phone ?? null, role: safeRole });
  writeAudit({ actor_id: actor(req), action: "create_employee", entity: "employees", entity_id: e.id });
  pushFlash(req, "success", `${e.full_name} added — fill out the profile next.`);
  res.redirect(`/employees/${e.id}`);
}

export function profile(req: Request, res: Response) {
  const id = Number(req.params.id);
  const employee = Employees.findFull(id);
  if (!employee) return res.status(404).render("errors/404");
  const tab = (req.query.tab as string) || "personal";
  const guarantors = Guarantors.listForEmployee(id);
  const attachments = Attachments.findByOwner("employee", id);
  const completeness = calculateCompleteness(id);
  const guarantorAttachments: Record<number, ReturnType<typeof Attachments.findByOwner>> = {};
  for (const g of guarantors) {
    guarantorAttachments[g.id] = Attachments.findByOwner("guarantor", g.id);
  }
  res.render("employees/profile", { employee, guarantors, attachments, guarantorAttachments, completeness, tab });
}

function refreshOnboardingStatus(id: number) {
  const status = calculateCompleteness(id).complete ? "complete" : "incomplete";
  Employees.setOnboardingStatus(id, status);
}

export function updatePersonal(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Employees.findFull(id)) return res.status(404).render("errors/404");
  Employees.updatePersonal(id, {
    full_name: (req.body.full_name ?? "").toString().trim(),
    phone: (req.body.phone || null) as string | null,
    national_id_number: req.body.national_id_number || null,
    national_id_type: req.body.national_id_type || null,
    date_of_birth: req.body.date_of_birth || null,
    gender: req.body.gender || null,
    marital_status: req.body.marital_status || null,
    address: req.body.address || null,
    emergency_contact_name: req.body.emergency_contact_name || null,
    emergency_contact_phone: req.body.emergency_contact_phone || null,
    emergency_contact_relation: req.body.emergency_contact_relation || null,
  });
  refreshOnboardingStatus(id);
  writeAudit({ actor_id: actor(req), action: "update_employee_personal", entity: "employees", entity_id: id });
  pushFlash(req, "success", "Personal info saved");
  res.redirect(`/employees/${id}?tab=personal`);
}

export function updateEmployment(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Employees.findFull(id)) return res.status(404).render("errors/404");
  const basic = req.body.basic_salary?.toString() || "0";
  const cents = Math.round(Number(basic) * 100);
  Employees.updateEmployment(id, {
    position: req.body.position || null,
    hire_date: req.body.hire_date || null,
    termination_date: req.body.termination_date || null,
    basic_salary: Number.isFinite(cents) ? cents : 0,
    role: req.body.role === "owner" ? "owner" : "employee",
    is_active: req.body.is_active === "true",
    username: req.body.username || null,
  });
  refreshOnboardingStatus(id);
  writeAudit({ actor_id: actor(req), action: "update_employee_employment", entity: "employees", entity_id: id });
  pushFlash(req, "success", "Employment info saved");
  res.redirect(`/employees/${id}?tab=employment`);
}

const ALLOWED_EMP_KINDS = ["profile_photo", "id_front", "id_back", "contract", "other"] as const;
type EmpKind = typeof ALLOWED_EMP_KINDS[number];

export async function uploadDocument(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Employees.findFull(id)) return res.status(404).render("errors/404");
  if (!req.file) {
    pushFlash(req, "error", "No file uploaded");
    return res.redirect(`/employees/${id}?tab=documents`);
  }
  const kindRaw = (req.body.kind || "other") as EmpKind;
  const kind: EmpKind = (ALLOWED_EMP_KINDS as readonly string[]).includes(kindRaw) ? kindRaw : "other";

  // Replace previous of same kind (we only keep the latest per kind for required slots)
  if (kind !== "other") {
    const existing = Attachments.findOneByKind("employee", id, kind);
    if (existing) {
      await deleteFile("employee", id, existing.filename, null);
      Attachments.remove(existing.id);
    }
  }

  const stored = await storeFile("employee", id, req.file);
  Attachments.create({
    owner_type: "employee",
    owner_id: id,
    kind,
    filename: stored.filename,
    original_name: req.file.originalname,
    mime_type: stored.mime,
    size_bytes: stored.size,
    uploaded_by: actor(req),
  });
  refreshOnboardingStatus(id);
  writeAudit({ actor_id: actor(req), action: `upload_${kind}`, entity: "employees", entity_id: id });
  pushFlash(req, "success", "File uploaded");
  res.redirect(`/employees/${id}?tab=documents`);
}

export async function deleteDocument(req: Request, res: Response) {
  const id = Number(req.params.id);
  const attId = Number(req.params.attId);
  const att = Attachments.findById(attId);
  if (!att || att.owner_id !== id || att.owner_type !== "employee") return res.status(404).render("errors/404");
  await deleteFile("employee", id, att.filename, null);
  Attachments.remove(attId);
  refreshOnboardingStatus(id);
  writeAudit({ actor_id: actor(req), action: "delete_document", entity: "attachments", entity_id: attId });
  pushFlash(req, "success", "File removed");
  res.redirect(`/employees/${id}?tab=documents`);
}

export function addGuarantor(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Employees.findFull(id)) return res.status(404).render("errors/404");
  const g = Guarantors.create({
    employee_id: id,
    full_name: (req.body.full_name ?? "").toString().trim() || "Unnamed guarantor",
    phone: req.body.phone || null,
    address: req.body.address || null,
    relation_to_employee: req.body.relation_to_employee || null,
    national_id_number: req.body.national_id_number || null,
    national_id_type: req.body.national_id_type || null,
    occupation: req.body.occupation || null,
    workplace: req.body.workplace || null,
    notes: req.body.notes || null,
  });
  refreshOnboardingStatus(id);
  writeAudit({ actor_id: actor(req), action: "add_guarantor", entity: "guarantors", entity_id: g.id });
  pushFlash(req, "success", "Guarantor added");
  res.redirect(`/employees/${id}?tab=guarantors`);
}

export function updateGuarantor(req: Request, res: Response) {
  const id = Number(req.params.id);
  const gid = Number(req.params.gid);
  const g = Guarantors.findById(gid);
  if (!g || g.employee_id !== id) return res.status(404).render("errors/404");
  Guarantors.update(gid, {
    full_name: (req.body.full_name ?? g.full_name).toString().trim(),
    phone: req.body.phone || null,
    address: req.body.address || null,
    relation_to_employee: req.body.relation_to_employee || null,
    national_id_number: req.body.national_id_number || null,
    national_id_type: req.body.national_id_type || null,
    occupation: req.body.occupation || null,
    workplace: req.body.workplace || null,
    notes: req.body.notes || null,
  });
  writeAudit({ actor_id: actor(req), action: "update_guarantor", entity: "guarantors", entity_id: gid });
  pushFlash(req, "success", "Guarantor updated");
  res.redirect(`/employees/${id}?tab=guarantors`);
}

export async function removeGuarantor(req: Request, res: Response) {
  const id = Number(req.params.id);
  const gid = Number(req.params.gid);
  const g = Guarantors.findById(gid);
  if (!g || g.employee_id !== id) return res.status(404).render("errors/404");
  // delete guarantor files first
  const atts = Attachments.findByOwner("guarantor", gid);
  for (const a of atts) await deleteFile("guarantor", gid, a.filename, null);
  Attachments.removeByOwner("guarantor", gid);
  Guarantors.remove(gid);
  refreshOnboardingStatus(id);
  writeAudit({ actor_id: actor(req), action: "delete_guarantor", entity: "guarantors", entity_id: gid });
  pushFlash(req, "success", "Guarantor removed");
  res.redirect(`/employees/${id}?tab=guarantors`);
}

const ALLOWED_GUARANTOR_KINDS = ["id_front", "id_back", "guarantor_letter", "other"] as const;
type GKind = typeof ALLOWED_GUARANTOR_KINDS[number];

export async function uploadGuarantorDocument(req: Request, res: Response) {
  const id = Number(req.params.id);
  const gid = Number(req.params.gid);
  const g = Guarantors.findById(gid);
  if (!g || g.employee_id !== id) return res.status(404).render("errors/404");
  if (!req.file) {
    pushFlash(req, "error", "No file uploaded");
    return res.redirect(`/employees/${id}?tab=guarantors`);
  }
  const kindRaw = (req.body.kind || "other") as GKind;
  const kind: GKind = (ALLOWED_GUARANTOR_KINDS as readonly string[]).includes(kindRaw) ? kindRaw : "other";

  if (kind !== "other") {
    const existing = Attachments.findOneByKind("guarantor", gid, kind);
    if (existing) {
      await deleteFile("guarantor", gid, existing.filename, null);
      Attachments.remove(existing.id);
    }
  }

  const stored = await storeFile("guarantor", gid, req.file);
  Attachments.create({
    owner_type: "guarantor",
    owner_id: gid,
    kind,
    filename: stored.filename,
    original_name: req.file.originalname,
    mime_type: stored.mime,
    size_bytes: stored.size,
    uploaded_by: actor(req),
  });
  refreshOnboardingStatus(id);
  writeAudit({ actor_id: actor(req), action: `upload_guarantor_${kind}`, entity: "guarantors", entity_id: gid });
  pushFlash(req, "success", "File uploaded");
  res.redirect(`/employees/${id}?tab=guarantors`);
}

export async function deleteGuarantorDocument(req: Request, res: Response) {
  const id = Number(req.params.id);
  const gid = Number(req.params.gid);
  const attId = Number(req.params.attId);
  const att = Attachments.findById(attId);
  if (!att || att.owner_type !== "guarantor" || att.owner_id !== gid) return res.status(404).render("errors/404");
  const g = Guarantors.findById(gid);
  if (!g || g.employee_id !== id) return res.status(404).render("errors/404");
  await deleteFile("guarantor", gid, att.filename, null);
  Attachments.remove(attId);
  refreshOnboardingStatus(id);
  writeAudit({ actor_id: actor(req), action: "delete_guarantor_document", entity: "attachments", entity_id: attId });
  pushFlash(req, "success", "File removed");
  res.redirect(`/employees/${id}?tab=guarantors`);
}

// Auth-gated file serving: only owners can view files
export function serveEmployeeFile(req: Request, res: Response) {
  const id = Number(req.params.id);
  const filename = req.params.filename;
  if (!/^[\w\-.]+$/.test(filename)) return res.status(400).send("Invalid filename");
  const full = pathFor("employee", id, filename);
  res.sendFile(resolve(full));
}

export function serveGuarantorFile(req: Request, res: Response) {
  const id = Number(req.params.id);
  const gid = Number(req.params.gid);
  const filename = req.params.filename;
  if (!/^[\w\-.]+$/.test(filename)) return res.status(400).send("Invalid filename");
  const g = Guarantors.findById(gid);
  if (!g || g.employee_id !== id) return res.status(404).send("Not found");
  const full = pathFor("guarantor", gid, filename);
  res.sendFile(resolve(full));
}
```

- [ ] **Step 4: Create `src/views/employees/list.ejs`**

```ejs
<%- include('../partials/head', { title: 'Employees', shopName }) %>
<body class="text-ink font-sans antialiased min-h-screen flex">
  <%- include('../partials/sidebar', { shopName, currentRole, currentUser, csrfToken, currentPath }) %>

  <main class="flex-1 px-air-lg pt-chapter pb-air-lg max-w-5xl">
    <header class="reveal reveal-1 flex items-end justify-between gap-gutter">
      <div>
        <p class="font-mono text-[12px] tracking-smallcaps uppercase text-smoke">People</p>
        <h1 class="font-display text-[36px] leading-[42px] text-ink mt-gutter-tight" style="font-variation-settings:'opsz' 72,'SOFT' 50">Employees</h1>
      </div>
      <div class="flex items-center gap-gutter">
        <a href="/employees?show=<%= showInactive ? 'active' : 'all' %>" class="font-sans text-[13px] text-smoke hover:text-ink transition-colors">
          <%= showInactive ? 'Hide inactive' : 'Show inactive' %>
        </a>
        <a href="/employees/new" class="btn-primary">Add employee</a>
      </div>
    </header>

    <div class="reveal reveal-2"><%- include('../partials/ornament') %></div>

    <%- include('../partials/flash', { flash }) %>

    <% if (employees.length === 0) { %>
      <div class="reveal reveal-3 card">
        <div class="card-body text-center py-air-lg">
          <p class="font-display italic text-[22px] text-coal" style="font-variation-settings:'opsz' 36,'SOFT' 50">No one on the roster yet.</p>
          <p class="font-sans text-[14px] text-smoke mt-gutter">Add your first employee to get started.</p>
          <a href="/employees/new" class="btn-primary mt-gutter-lg">Add employee</a>
        </div>
      </div>
    <% } else { %>
      <div class="reveal reveal-3 card">
        <table class="w-full">
          <thead>
            <tr class="border-b border-rule">
              <th class="text-left font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke px-gutter-lg py-gutter">Name</th>
              <th class="text-left font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke py-gutter">Position</th>
              <th class="text-left font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke py-gutter">Role</th>
              <th class="text-left font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke py-gutter">Status</th>
              <th class="px-gutter-lg"></th>
            </tr>
          </thead>
          <tbody>
            <% employees.forEach(({ employee, completeness }) => { %>
              <tr class="border-b border-rule last:border-0 hover:bg-paper transition-colors">
                <td class="px-gutter-lg py-gutter-lg">
                  <a href="/employees/<%= employee.id %>" class="font-sans text-[15px] text-ink hover:text-ember transition-colors">
                    <%= employee.full_name %>
                  </a>
                  <% if (!employee.is_active) { %>
                    <span class="ml-2 font-sans text-[11px] tracking-smallcaps uppercase text-smoke">inactive</span>
                  <% } %>
                </td>
                <td class="py-gutter-lg font-sans text-[14px] text-coal"><%= employee.position || '—' %></td>
                <td class="py-gutter-lg font-sans text-[14px] text-coal capitalize"><%= employee.role %></td>
                <td class="py-gutter-lg">
                  <% if (completeness.complete) { %>
                    <span class="pip pip-approved">Complete</span>
                  <% } else { %>
                    <span class="pip pip-draft" title="Missing: <%= completeness.missing.join(', ') %>">
                      <%= completeness.missing.length %> missing
                    </span>
                  <% } %>
                </td>
                <td class="px-gutter-lg py-gutter-lg text-right">
                  <a href="/employees/<%= employee.id %>" class="font-sans text-[12px] tracking-smallcaps uppercase text-ember hover:text-ember-deep transition-colors">Open →</a>
                </td>
              </tr>
            <% }) %>
          </tbody>
        </table>
      </div>
    <% } %>
  </main>
</body>
</html>
```

- [ ] **Step 5: Verify build + tests**

```bash
npm run build
npm test
```

Build clean, all tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/controllers/employeesController.ts src/routes/employees.ts src/routes/index.ts src/views/employees/list.ejs
git commit -m "feat(employees): list page + controller + router scaffold"
```

---

## Task 7: New employee page

**Files:** `src/views/employees/new.ejs`

The "Add employee" form is intentionally minimal — just full name + phone + role. All other fields are filled in on the profile page after creation.

- [ ] **Step 1: Create `src/views/employees/new.ejs`**

```ejs
<%- include('../partials/head', { title: 'Add employee', shopName }) %>
<body class="text-ink font-sans antialiased min-h-screen flex">
  <%- include('../partials/sidebar', { shopName, currentRole, currentUser, csrfToken, currentPath }) %>

  <main class="flex-1 px-air-lg pt-chapter pb-air-lg max-w-xl">
    <header class="reveal reveal-1">
      <p class="font-mono text-[12px] tracking-smallcaps uppercase text-smoke">
        <a href="/employees" class="hover:text-ink transition-colors">Employees</a> · New
      </p>
      <h1 class="font-display text-[36px] leading-[42px] text-ink mt-gutter-tight" style="font-variation-settings:'opsz' 72,'SOFT' 50">Add employee</h1>
      <p class="font-sans text-coal mt-gutter">A short stub to start with. You can fill the rest in on the profile page.</p>
    </header>

    <div class="reveal reveal-2"><%- include('../partials/ornament') %></div>

    <%- include('../partials/flash', { flash }) %>

    <form method="POST" action="/employees" class="reveal reveal-3 card">
      <div class="card-body space-y-gutter-lg">
        <input type="hidden" name="_csrf" value="<%= csrfToken %>" />
        <label class="block">
          <span class="field-label">Full name</span>
          <input name="full_name" required autofocus class="field-input" />
        </label>
        <label class="block">
          <span class="field-label">Phone</span>
          <input name="phone" class="field-input field-mono" placeholder="+251..." />
        </label>
        <label class="block">
          <span class="field-label">Role</span>
          <select name="role" class="field-input">
            <option value="employee">Employee</option>
            <option value="owner">Owner (full access)</option>
          </select>
        </label>
      </div>
      <div class="px-gutter-lg pb-gutter-lg flex items-center justify-end gap-gutter">
        <a href="/employees" class="btn-secondary">Cancel</a>
        <button class="btn-primary">Add employee →</button>
      </div>
    </form>
  </main>
</body>
</html>
```

- [ ] **Step 2: Manual check (or skip — just run build)**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/views/employees/new.ejs
git commit -m "feat(employees): new employee form"
```

---

## Task 8: Profile page shell with tab nav + Personal tab

**Files:** `src/views/employees/profile.ejs`, `src/views/employees/_personal.ejs`

`profile.ejs` is the shell that includes one of the `_*.ejs` partials based on the current `tab` query string.

- [ ] **Step 1: Create `src/views/employees/profile.ejs`**

```ejs
<%- include('../partials/head', { title: employee.full_name, shopName }) %>
<body class="text-ink font-sans antialiased min-h-screen flex">
  <%- include('../partials/sidebar', { shopName, currentRole, currentUser, csrfToken, currentPath }) %>

  <%
    const tabs = [
      { key: 'personal',    label: 'Personal' },
      { key: 'documents',   label: 'Documents' },
      { key: 'guarantors',  label: 'Guarantors' },
      { key: 'employment',  label: 'Employment' },
      { key: 'payroll',     label: 'Payroll' },
    ];
  %>

  <main class="flex-1 px-air-lg pt-chapter pb-air-lg max-w-4xl">
    <header class="reveal reveal-1 flex items-start justify-between gap-air">
      <div>
        <p class="font-mono text-[12px] tracking-smallcaps uppercase text-smoke">
          <a href="/employees" class="hover:text-ink transition-colors">Employees</a> · <%= employee.position || 'No position set' %>
        </p>
        <h1 class="font-display text-[40px] leading-[44px] text-ink mt-gutter-tight" style="font-variation-settings:'opsz' 80,'SOFT' 50"><%= employee.full_name %></h1>
        <div class="mt-gutter">
          <% if (completeness.complete) { %>
            <span class="pip pip-approved">Onboarding complete</span>
          <% } else { %>
            <span class="pip pip-draft" title="<%= completeness.missing.join(', ') %>">
              <%= completeness.missing.length %> item<%= completeness.missing.length === 1 ? '' : 's' %> missing
            </span>
          <% } %>
        </div>
      </div>
    </header>

    <nav class="reveal reveal-2 mt-air-lg border-b border-rule-strong flex gap-air-lg">
      <% tabs.forEach(t => {
           const isActive = t.key === tab;
      %>
        <a href="/employees/<%= employee.id %>?tab=<%= t.key %>"
           class="relative pb-gutter font-sans text-[14px] transition-colors <%= isActive ? 'text-ink' : 'text-smoke hover:text-coal' %>">
          <%= t.label %>
          <% if (isActive) { %>
            <span class="absolute left-0 right-0 -bottom-px h-[2px] bg-ember"></span>
          <% } %>
        </a>
      <% }) %>
    </nav>

    <%- include('../partials/flash', { flash }) %>

    <section class="reveal reveal-3 mt-air">
      <% if (tab === 'personal')   { %><%- include('_personal',   { employee, csrfToken }) %><% } %>
      <% if (tab === 'documents')  { %><%- include('_documents',  { employee, attachments, csrfToken }) %><% } %>
      <% if (tab === 'guarantors') { %><%- include('_guarantors', { employee, guarantors, guarantorAttachments, csrfToken }) %><% } %>
      <% if (tab === 'employment') { %><%- include('_employment', { employee, csrfToken }) %><% } %>
      <% if (tab === 'payroll')    { %><%- include('_payroll',    { employee }) %><% } %>
    </section>
  </main>
</body>
</html>
```

- [ ] **Step 2: Create `src/views/employees/_personal.ejs`**

```ejs
<form method="POST" action="/employees/<%= employee.id %>/personal" class="card">
  <input type="hidden" name="_csrf" value="<%= csrfToken %>" />
  <header class="card-header">
    <h2 class="card-title">Personal information</h2>
    <p class="card-meta">Identity, contact, emergency</p>
  </header>
  <div class="card-body grid grid-cols-2 gap-x-air gap-y-gutter-lg">
    <label class="block col-span-2">
      <span class="field-label">Full name</span>
      <input name="full_name" required value="<%= employee.full_name %>" class="field-input" />
    </label>
    <label class="block">
      <span class="field-label">Phone</span>
      <input name="phone" value="<%= employee.phone || '' %>" class="field-input field-mono" />
    </label>
    <label class="block">
      <span class="field-label">Date of birth</span>
      <input type="date" name="date_of_birth" value="<%= employee.date_of_birth || '' %>" class="field-input field-mono" />
    </label>
    <label class="block">
      <span class="field-label">Gender</span>
      <select name="gender" class="field-input">
        <% ['', 'F', 'M', 'Other'].forEach(g => { %>
          <option value="<%= g %>" <%= (employee.gender || '') === g ? 'selected' : '' %>><%= g || '—' %></option>
        <% }) %>
      </select>
    </label>
    <label class="block">
      <span class="field-label">Marital status</span>
      <select name="marital_status" class="field-input">
        <% ['', 'single', 'married', 'divorced', 'widowed'].forEach(s => { %>
          <option value="<%= s %>" <%= (employee.marital_status || '') === s ? 'selected' : '' %>><%= s || '—' %></option>
        <% }) %>
      </select>
    </label>
    <label class="block">
      <span class="field-label">National ID type</span>
      <select name="national_id_type" class="field-input">
        <% ['', 'Kebele', 'Passport', 'Driving license', 'Other'].forEach(t => { %>
          <option value="<%= t %>" <%= (employee.national_id_type || '') === t ? 'selected' : '' %>><%= t || '—' %></option>
        <% }) %>
      </select>
    </label>
    <label class="block">
      <span class="field-label">National ID number</span>
      <input name="national_id_number" value="<%= employee.national_id_number || '' %>" class="field-input field-mono" />
    </label>
    <label class="block col-span-2">
      <span class="field-label">Address</span>
      <input name="address" value="<%= employee.address || '' %>" class="field-input" />
    </label>

    <div class="col-span-2 mt-gutter">
      <p class="font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke mb-gutter">Emergency contact</p>
    </div>
    <label class="block">
      <span class="field-label">Name</span>
      <input name="emergency_contact_name" value="<%= employee.emergency_contact_name || '' %>" class="field-input" />
    </label>
    <label class="block">
      <span class="field-label">Phone</span>
      <input name="emergency_contact_phone" value="<%= employee.emergency_contact_phone || '' %>" class="field-input field-mono" />
    </label>
    <label class="block col-span-2">
      <span class="field-label">Relation</span>
      <input name="emergency_contact_relation" value="<%= employee.emergency_contact_relation || '' %>" class="field-input" />
    </label>
  </div>
  <div class="px-gutter-lg pb-gutter-lg flex items-center justify-end gap-gutter">
    <button class="btn-primary">Save personal info</button>
  </div>
</form>
```

- [ ] **Step 3: Commit**

```bash
git add src/views/employees/profile.ejs src/views/employees/_personal.ejs
git commit -m "feat(employees): profile shell + Personal tab"
```

---

## Task 9: Documents tab + uploads

**Files:** `src/views/employees/_documents.ejs`

The Documents tab shows 4 required slots (profile photo, ID front, ID back, contract) + an "Other" upload area. Each slot is either empty (shows an upload form) or filled (shows a thumbnail/file name + a delete button). The thumbnail is fetched from the auth-gated `/employees/:id/files/:filename` route.

- [ ] **Step 1: Create `src/views/employees/_documents.ejs`**

```ejs
<%
  function findAtt(kind) {
    return attachments.find(a => a.kind === kind) || null;
  }
  const slots = [
    { key: 'profile_photo', label: 'Profile photo' },
    { key: 'id_front',      label: 'ID — front'   },
    { key: 'id_back',       label: 'ID — back'    },
    { key: 'contract',      label: 'Signed contract' },
  ];
  const others = attachments.filter(a => a.kind === 'other');
%>

<div class="grid grid-cols-2 gap-air">
  <% slots.forEach(slot => {
       const att = findAtt(slot.key);
  %>
    <article class="card">
      <header class="card-header flex items-start justify-between gap-gutter">
        <div>
          <h3 class="font-display text-[18px] text-ink" style="font-variation-settings:'opsz' 24,'SOFT' 50"><%= slot.label %></h3>
          <% if (att) { %>
            <p class="card-meta truncate"><%= att.original_name %></p>
          <% } else { %>
            <p class="card-meta">Required</p>
          <% } %>
        </div>
        <% if (att) { %>
          <span class="pip pip-approved">Uploaded</span>
        <% } else { %>
          <span class="pip pip-draft">Missing</span>
        <% } %>
      </header>
      <div class="card-body">
        <% if (att) { %>
          <% if (att.mime_type.startsWith('image/')) { %>
            <a href="/employees/<%= employee.id %>/files/<%= att.filename %>" target="_blank" class="block">
              <img src="/employees/<%= employee.id %>/files/<%= att.filename %>"
                   alt="<%= att.original_name %>"
                   class="w-full max-h-48 object-cover border border-rule rounded-soft" />
            </a>
          <% } else { %>
            <a href="/employees/<%= employee.id %>/files/<%= att.filename %>" target="_blank" class="link">
              View document
            </a>
          <% } %>
          <form method="POST" action="/employees/<%= employee.id %>/documents/<%= att.id %>/delete" class="mt-gutter">
            <input type="hidden" name="_csrf" value="<%= csrfToken %>" />
            <button class="btn-danger w-full">Remove</button>
          </form>
        <% } else { %>
          <form method="POST" action="/employees/<%= employee.id %>/documents" enctype="multipart/form-data" class="space-y-gutter">
            <input type="hidden" name="_csrf" value="<%= csrfToken %>" />
            <input type="hidden" name="kind" value="<%= slot.key %>" />
            <input type="file" name="file" required accept="image/*,.pdf" class="font-sans text-[14px] block w-full" />
            <button class="btn-primary w-full">Upload</button>
          </form>
        <% } %>
      </div>
    </article>
  <% }) %>
</div>

<article class="card mt-air">
  <header class="card-header">
    <h3 class="card-title">Other documents</h3>
    <p class="card-meta">Anything else worth keeping on file</p>
  </header>
  <div class="card-body space-y-gutter">
    <% if (others.length) { %>
      <ul class="divide-y divide-rule">
        <% others.forEach(a => { %>
          <li class="py-gutter flex items-center justify-between">
            <a href="/employees/<%= employee.id %>/files/<%= a.filename %>" target="_blank" class="link font-sans text-[14px] truncate"><%= a.original_name %></a>
            <form method="POST" action="/employees/<%= employee.id %>/documents/<%= a.id %>/delete">
              <input type="hidden" name="_csrf" value="<%= csrfToken %>" />
              <button class="font-sans text-[12px] tracking-smallcaps uppercase text-crimson hover:text-ember-deep transition-colors">Remove</button>
            </form>
          </li>
        <% }) %>
      </ul>
    <% } %>

    <form method="POST" action="/employees/<%= employee.id %>/documents" enctype="multipart/form-data" class="flex items-end gap-gutter pt-gutter border-t border-rule">
      <input type="hidden" name="_csrf" value="<%= csrfToken %>" />
      <input type="hidden" name="kind" value="other" />
      <label class="flex-1">
        <span class="field-label">Add document</span>
        <input type="file" name="file" required accept="image/*,.pdf" class="font-sans text-[14px] block w-full mt-1" />
      </label>
      <button class="btn-primary">Upload</button>
    </form>
  </div>
</article>
```

- [ ] **Step 2: Commit**

```bash
git add src/views/employees/_documents.ejs
git commit -m "feat(employees): Documents tab with upload + thumbnails"
```

---

## Task 10: Guarantors tab

**Files:** `src/views/employees/_guarantors.ejs`

- [ ] **Step 1: Create `src/views/employees/_guarantors.ejs`**

```ejs
<% if (guarantors.length === 0) { %>
  <div class="card mb-air">
    <div class="card-body text-center py-air">
      <p class="font-display italic text-[20px] text-coal" style="font-variation-settings:'opsz' 24,'SOFT' 50">No guarantors yet.</p>
      <p class="font-sans text-[13px] text-smoke mt-gutter">At least one is needed for a complete record.</p>
    </div>
  </div>
<% } %>

<% guarantors.forEach((g, i) => {
     const gAtts = guarantorAttachments[g.id] || [];
     function gAtt(kind) { return gAtts.find(a => a.kind === kind) || null; }
%>
  <article class="card mb-air">
    <header class="card-header flex items-start justify-between">
      <div>
        <p class="font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke">Guarantor #<%= i + 1 %></p>
        <h3 class="card-title mt-1"><%= g.full_name %></h3>
        <% if (g.relation_to_employee) { %>
          <p class="card-meta"><%= g.relation_to_employee %></p>
        <% } %>
      </div>
      <form method="POST" action="/employees/<%= employee.id %>/guarantors/<%= g.id %>/delete" onsubmit="return confirm('Remove this guarantor and all their files?')">
        <input type="hidden" name="_csrf" value="<%= csrfToken %>" />
        <button class="font-sans text-[12px] tracking-smallcaps uppercase text-crimson hover:text-ember-deep transition-colors">Remove</button>
      </form>
    </header>
    <form method="POST" action="/employees/<%= employee.id %>/guarantors/<%= g.id %>" class="card-body grid grid-cols-2 gap-x-air gap-y-gutter-lg">
      <input type="hidden" name="_csrf" value="<%= csrfToken %>" />
      <label class="block col-span-2">
        <span class="field-label">Full name</span>
        <input name="full_name" required value="<%= g.full_name %>" class="field-input" />
      </label>
      <label class="block">
        <span class="field-label">Phone</span>
        <input name="phone" value="<%= g.phone || '' %>" class="field-input field-mono" />
      </label>
      <label class="block">
        <span class="field-label">Relation to employee</span>
        <input name="relation_to_employee" value="<%= g.relation_to_employee || '' %>" class="field-input" />
      </label>
      <label class="block">
        <span class="field-label">National ID type</span>
        <select name="national_id_type" class="field-input">
          <% ['', 'Kebele', 'Passport', 'Driving license', 'Other'].forEach(t => { %>
            <option value="<%= t %>" <%= (g.national_id_type || '') === t ? 'selected' : '' %>><%= t || '—' %></option>
          <% }) %>
        </select>
      </label>
      <label class="block">
        <span class="field-label">National ID number</span>
        <input name="national_id_number" value="<%= g.national_id_number || '' %>" class="field-input field-mono" />
      </label>
      <label class="block col-span-2">
        <span class="field-label">Address</span>
        <input name="address" value="<%= g.address || '' %>" class="field-input" />
      </label>
      <label class="block">
        <span class="field-label">Occupation</span>
        <input name="occupation" value="<%= g.occupation || '' %>" class="field-input" />
      </label>
      <label class="block">
        <span class="field-label">Workplace</span>
        <input name="workplace" value="<%= g.workplace || '' %>" class="field-input" />
      </label>
      <label class="block col-span-2">
        <span class="field-label">Notes</span>
        <textarea name="notes" rows="2" class="field-input"><%= g.notes || '' %></textarea>
      </label>
      <div class="col-span-2 flex items-center justify-end">
        <button class="btn-primary">Save guarantor</button>
      </div>
    </form>

    <div class="card-body border-t border-rule">
      <p class="font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke mb-gutter">Guarantor documents</p>
      <div class="grid grid-cols-3 gap-gutter">
        <% ['id_front', 'id_back', 'guarantor_letter'].forEach(kind => {
             const a = gAtt(kind);
             const label = kind === 'id_front' ? 'ID — front' : kind === 'id_back' ? 'ID — back' : 'Letter of guarantee';
        %>
          <div class="border border-rule rounded-soft p-gutter">
            <p class="font-sans font-medium text-[11px] tracking-smallcaps uppercase text-smoke"><%= label %></p>
            <% if (a) { %>
              <% if (a.mime_type.startsWith('image/')) { %>
                <a href="/employees/<%= employee.id %>/guarantors/<%= g.id %>/files/<%= a.filename %>" target="_blank" class="block mt-gutter">
                  <img src="/employees/<%= employee.id %>/guarantors/<%= g.id %>/files/<%= a.filename %>" class="w-full h-24 object-cover border border-rule rounded-soft" />
                </a>
              <% } else { %>
                <a href="/employees/<%= employee.id %>/guarantors/<%= g.id %>/files/<%= a.filename %>" target="_blank" class="link mt-gutter inline-block">View</a>
              <% } %>
              <form method="POST" action="/employees/<%= employee.id %>/guarantors/<%= g.id %>/documents/<%= a.id %>/delete" class="mt-gutter">
                <input type="hidden" name="_csrf" value="<%= csrfToken %>" />
                <button class="font-sans text-[11px] tracking-smallcaps uppercase text-crimson hover:text-ember-deep transition-colors">Remove</button>
              </form>
            <% } else { %>
              <form method="POST" action="/employees/<%= employee.id %>/guarantors/<%= g.id %>/documents" enctype="multipart/form-data" class="mt-gutter space-y-1">
                <input type="hidden" name="_csrf" value="<%= csrfToken %>" />
                <input type="hidden" name="kind" value="<%= kind %>" />
                <input type="file" name="file" required accept="image/*,.pdf" class="font-sans text-[12px] block w-full" />
                <button class="font-sans text-[11px] tracking-smallcaps uppercase text-ember hover:text-ember-deep transition-colors">Upload</button>
              </form>
            <% } %>
          </div>
        <% }) %>
      </div>
    </div>
  </article>
<% }) %>

<article class="card">
  <header class="card-header">
    <h3 class="card-title">Add a guarantor</h3>
    <p class="card-meta">You can add more than one if needed</p>
  </header>
  <form method="POST" action="/employees/<%= employee.id %>/guarantors" class="card-body grid grid-cols-2 gap-x-air gap-y-gutter-lg">
    <input type="hidden" name="_csrf" value="<%= csrfToken %>" />
    <label class="block col-span-2">
      <span class="field-label">Full name</span>
      <input name="full_name" required class="field-input" />
    </label>
    <label class="block">
      <span class="field-label">Phone</span>
      <input name="phone" class="field-input field-mono" />
    </label>
    <label class="block">
      <span class="field-label">Relation</span>
      <input name="relation_to_employee" class="field-input" />
    </label>
    <div class="col-span-2 flex items-center justify-end">
      <button class="btn-primary">Add guarantor →</button>
    </div>
  </form>
</article>
```

- [ ] **Step 2: Commit**

```bash
git add src/views/employees/_guarantors.ejs
git commit -m "feat(employees): Guarantors tab with nested CRUD + uploads"
```

---

## Task 11: Employment + Payroll history tabs

**Files:** `src/views/employees/_employment.ejs`, `src/views/employees/_payroll.ejs`

- [ ] **Step 1: Create `src/views/employees/_employment.ejs`**

```ejs
<form method="POST" action="/employees/<%= employee.id %>/employment" class="card">
  <input type="hidden" name="_csrf" value="<%= csrfToken %>" />
  <header class="card-header">
    <h2 class="card-title">Employment</h2>
    <p class="card-meta">Role, salary, and login access</p>
  </header>
  <div class="card-body grid grid-cols-2 gap-x-air gap-y-gutter-lg">
    <label class="block">
      <span class="field-label">Position</span>
      <input name="position" value="<%= employee.position || '' %>" class="field-input" placeholder="Barista" />
    </label>
    <label class="block">
      <span class="field-label">Basic salary (per month)</span>
      <input name="basic_salary" value="<%= (employee.basic_salary / 100).toFixed(2) %>" class="field-input field-mono" />
    </label>
    <label class="block">
      <span class="field-label">Hire date</span>
      <input type="date" name="hire_date" value="<%= employee.hire_date || '' %>" class="field-input field-mono" />
    </label>
    <label class="block">
      <span class="field-label">Termination date</span>
      <input type="date" name="termination_date" value="<%= employee.termination_date || '' %>" class="field-input field-mono" />
    </label>
    <label class="block">
      <span class="field-label">Role</span>
      <select name="role" class="field-input">
        <% ['employee', 'owner'].forEach(r => { %>
          <option value="<%= r %>" <%= employee.role === r ? 'selected' : '' %>><%= r === 'owner' ? 'Owner (full access)' : 'Employee' %></option>
        <% }) %>
      </select>
    </label>
    <label class="block">
      <span class="field-label">Status</span>
      <select name="is_active" class="field-input">
        <option value="true"  <%= employee.is_active ? 'selected' : '' %>>Active</option>
        <option value="false" <%= !employee.is_active ? 'selected' : '' %>>Inactive</option>
      </select>
    </label>
    <label class="block col-span-2">
      <span class="field-label">Username (optional — required if they need to log in)</span>
      <input name="username" value="<%= employee.username || '' %>" class="field-input field-mono" placeholder="leave blank if no login" />
      <span class="field-hint">Owner can set a password from a future profile tab. For now, the cashier signs in once the username + password are set via the setup or password-reset flow.</span>
    </label>
  </div>
  <div class="px-gutter-lg pb-gutter-lg flex items-center justify-end gap-gutter">
    <button class="btn-primary">Save employment</button>
  </div>
</form>
```

- [ ] **Step 2: Create `src/views/employees/_payroll.ejs`** (placeholder until Plan 5)

```ejs
<div class="card">
  <div class="card-body text-center py-air">
    <p class="font-display italic text-[20px] text-coal" style="font-variation-settings:'opsz' 24,'SOFT' 50">No payroll history yet.</p>
    <p class="font-sans text-[13px] text-smoke mt-gutter">Past payroll runs for <%= employee.full_name %> will appear here once the Payroll module is built.</p>
  </div>
</div>
```

- [ ] **Step 3: Build + commit**

```bash
npm run build
git add src/views/employees/_employment.ejs src/views/employees/_payroll.ejs
git commit -m "feat(employees): Employment + Payroll-history tabs"
```

---

## Task 12: Integration test — end-to-end onboarding

**Files:** `tests/integration/employees.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { unlinkSync, existsSync, rmSync } from "fs";
import { closeDb, runMigrations } from "../../src/lib/db";
import * as Employees from "../../src/models/employees";

const TEST_DB = "./data/test-employees-int.db";
process.env.DB_PATH = TEST_DB;
process.env.SESSION_SECRET = "test-secret";

async function loginAsOwner(app: any): Promise<request.SuperAgentTest> {
  const agent = request.agent(app);
  const r1 = await agent.get("/login");
  const csrf = /name="_csrf" value="([^"]+)"/.exec(r1.text)![1];
  await agent.post("/login").type("form").send({ _csrf: csrf, username: "owner", password: "secret123" });
  return agent;
}

async function csrfFrom(agent: any, path: string): Promise<string> {
  const r = await agent.get(path);
  return /name="_csrf" value="([^"]+)"/.exec(r.text)![1];
}

beforeEach(async () => {
  closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  if (existsSync("./data/uploads")) rmSync("./data/uploads", { recursive: true, force: true });
  runMigrations();
  const hash = await bcrypt.hash("secret123", 12);
  Employees.create({ full_name: "Owner", username: "owner", password_hash: hash, role: "owner" });
});

afterAll(() => {
  closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  if (existsSync("./data/uploads")) rmSync("./data/uploads", { recursive: true, force: true });
});

describe("Employees onboarding flow", () => {
  it("renders the employees list with an empty state", async () => {
    const { app } = await import("../../src/app");
    const agent = await loginAsOwner(app);
    const res = await agent.get("/employees");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Employees");
    expect(res.text).toContain("No one on the roster yet");
  });

  it("creates an employee via POST /employees", async () => {
    const { app } = await import("../../src/app");
    const agent = await loginAsOwner(app);
    const csrf = await csrfFrom(agent, "/employees/new");
    const res = await agent.post("/employees").type("form").send({ _csrf: csrf, full_name: "Almaz", phone: "+251911", role: "employee" });
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/employees\/\d+$/);
    const list = await agent.get("/employees");
    expect(list.text).toContain("Almaz");
  });

  it("renders the profile and personal tab with form fields", async () => {
    const { app } = await import("../../src/app");
    const agent = await loginAsOwner(app);
    const csrf = await csrfFrom(agent, "/employees/new");
    const create = await agent.post("/employees").type("form").send({ _csrf: csrf, full_name: "Almaz", phone: "", role: "employee" });
    const profileUrl = create.headers.location!;
    const res = await agent.get(profileUrl);
    expect(res.text).toContain("Almaz");
    expect(res.text).toContain("Personal");
    expect(res.text).toContain("Documents");
    expect(res.text).toContain("Guarantors");
    expect(res.text).toContain("Employment");
    expect(res.text).toContain("missing"); // status badge
  });

  it("saves personal info and updates onboarding completeness", async () => {
    const { app } = await import("../../src/app");
    const agent = await loginAsOwner(app);
    let csrf = await csrfFrom(agent, "/employees/new");
    const create = await agent.post("/employees").type("form").send({ _csrf: csrf, full_name: "Almaz", phone: "", role: "employee" });
    const profileUrl = create.headers.location!;
    const id = Number(profileUrl.split("/").pop());

    csrf = await csrfFrom(agent, `${profileUrl}?tab=personal`);
    await agent.post(`/employees/${id}/personal`).type("form").send({
      _csrf: csrf,
      full_name: "Almaz Tesfaye",
      phone: "+251911234567",
      national_id_number: "ID123",
      national_id_type: "Kebele",
      date_of_birth: "1995-04-10",
      gender: "F",
      marital_status: "single",
      address: "Bole, Addis Ababa",
      emergency_contact_name: "Hanna",
      emergency_contact_phone: "+251911234568",
      emergency_contact_relation: "Sister",
    });

    const full = Employees.findFull(id);
    expect(full?.phone).toBe("+251911234567");
    expect(full?.onboarding_status).toBe("incomplete"); // docs + guarantor still missing
  });

  it("blocks employee role from /employees", async () => {
    const { app } = await import("../../src/app");
    // employee account
    const hash = await bcrypt.hash("emp123", 12);
    Employees.create({ full_name: "Cashier", username: "cash", password_hash: hash, role: "employee" });

    const agent = request.agent(app);
    let csrf = await csrfFrom(agent, "/login");
    await agent.post("/login").type("form").send({ _csrf: csrf, username: "cash", password: "emp123" });
    const res = await agent.get("/employees");
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run, expect pass**

```bash
npm test
```

Expected: 40 prior + 5 new = 45 employees integration tests, plus the earlier model tests = total ~55 passing.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/employees.test.ts
git commit -m "test(employees): end-to-end onboarding integration"
```

---

## Plan 2 — done

After all 12 tasks land:
- Owner can add an employee, fill personal info, upload all 4 required documents, add guarantor(s) with their own ID copies, edit employment info.
- Status badges on the list page (Complete ✓ / N missing) update automatically as fields/files/guarantors are added or removed.
- All uploads are auth-gated — files are never served from a public path.
- All writes append to `audit_log`.
- Test count grows by ~15 (models + integration).

**Next:** Plan 3 (Menu & Sales) — the cashier-facing module.
