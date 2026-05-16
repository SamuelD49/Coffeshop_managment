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

export async function calculateCompleteness(employeeId: number): Promise<CompletenessResult> {
  const employee = await Employees.findFull(employeeId);
  if (!employee) return { complete: false, missing: ["employee_not_found"] };

  const missing: string[] = [];

  for (const field of REQUIRED_PERSONAL) {
    const v = employee[field];
    if (v === null || v === undefined || v === "") missing.push(field as string);
  }

  for (const kind of REQUIRED_DOCS) {
    if (!(await Attachments.findOneByKind("employee", employeeId, kind))) {
      missing.push(kind);
    }
  }

  const guarantors = await Guarantors.listForEmployee(employeeId);
  if (guarantors.length === 0) {
    missing.push("guarantor");
  } else {
    let firstWithId = false;
    for (const g of guarantors) {
      if (await Attachments.findOneByKind("guarantor", g.id, "id_front")) {
        firstWithId = true;
        break;
      }
    }
    if (!firstWithId) missing.push("guarantor_id");
  }

  return { complete: missing.length === 0, missing };
}
