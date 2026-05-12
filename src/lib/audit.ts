import { getDb } from "./db";

export type AuditEntry = {
  actor_id: number | null;
  action: string;
  entity: string;
  entity_id: number | null;
};

export function writeAudit(entry: AuditEntry): void {
  getDb()
    .prepare(`
      INSERT INTO audit_log (actor_id, action, entity, entity_id)
      VALUES (@actor_id, @action, @entity, @entity_id)
    `)
    .run(entry);
}
