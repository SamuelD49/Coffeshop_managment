import { getDb, nowIso } from "./kysely";
import { currentShopId } from "./shopContext";

export type AuditEntry = {
  actor_id: number | null;
  action: string;
  entity: string;
  entity_id: number | null;
};

export async function writeAudit(entry: AuditEntry): Promise<void> {
  await getDb().insertInto("audit_log").values({
    shop_id: currentShopId(),
    actor_id: entry.actor_id,
    action: entry.action,
    entity: entry.entity,
    entity_id: entry.entity_id,
    at: nowIso(),
  }).execute();
}

export async function recentActions(limit: number = 50): Promise<Array<{
  id: number;
  actor_id: number | null;
  action: string;
  entity: string;
  entity_id: number | null;
  at: string;
}>> {
  return await getDb()
    .selectFrom("audit_log")
    .selectAll()
    .where("shop_id", "=", currentShopId())
    .orderBy("at", "desc")
    .limit(limit)
    .execute();
}
