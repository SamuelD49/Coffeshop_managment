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
