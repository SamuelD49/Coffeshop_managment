import { getDb, nowIso } from "./kysely";

export type AuditEntry = {
  actor_id: number | null;
  action: string;
  entity: string;
  entity_id: number | null;
};

export async function writeAudit(entry: AuditEntry): Promise<void> {
  await getDb().insertInto("audit_log").values({
    actor_id: entry.actor_id,
    action: entry.action,
    entity: entry.entity,
    entity_id: entry.entity_id,
    at: nowIso(),
  }).execute();
}
