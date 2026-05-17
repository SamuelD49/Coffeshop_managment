import { getDb, nowIso } from "../lib/kysely";
import { currentShopId } from "../lib/shopContext";
import type { AttachmentsTable } from "../lib/db-types";
import type { Selectable } from "kysely";

export type AttachmentKind = "profile_photo" | "id_front" | "id_back" | "contract" | "guarantor_letter" | "other";
export type OwnerType = "employee" | "guarantor";

export type Attachment = Selectable<AttachmentsTable>;

export type AttachmentInput = {
  owner_type: OwnerType;
  owner_id: number;
  kind: AttachmentKind;
  filename: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: number | null;
  thumbnail?: string | null;
};

export async function create(input: AttachmentInput): Promise<Attachment> {
  const result = await getDb()
    .insertInto("attachments")
    .values({
      shop_id: currentShopId(),
      owner_type: input.owner_type,
      owner_id: input.owner_id,
      kind: input.kind,
      filename: input.filename,
      original_name: input.original_name,
      mime_type: input.mime_type,
      size_bytes: input.size_bytes,
      uploaded_by: input.uploaded_by,
      thumbnail: input.thumbnail ?? null,
      uploaded_at: nowIso(),
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return (await findById(result.id))!;
}

export async function findById(id: number): Promise<Attachment | null> {
  const row = await getDb()
    .selectFrom("attachments")
    .selectAll()
    .where("shop_id", "=", currentShopId())
    .where("id", "=", id)
    .executeTakeFirst();
  return row ?? null;
}

export async function findByOwner(ownerType: OwnerType, ownerId: number): Promise<Attachment[]> {
  return await getDb()
    .selectFrom("attachments")
    .selectAll()
    .where("shop_id", "=", currentShopId())
    .where("owner_type", "=", ownerType)
    .where("owner_id", "=", ownerId)
    .orderBy("uploaded_at")
    .orderBy("id")
    .execute();
}

export async function findOneByKind(ownerType: OwnerType, ownerId: number, kind: AttachmentKind): Promise<Attachment | null> {
  const row = await getDb()
    .selectFrom("attachments")
    .selectAll()
    .where("shop_id", "=", currentShopId())
    .where("owner_type", "=", ownerType)
    .where("owner_id", "=", ownerId)
    .where("kind", "=", kind)
    .orderBy("uploaded_at", "desc")
    .orderBy("id", "desc")
    .limit(1)
    .executeTakeFirst();
  return row ?? null;
}

export async function remove(id: number): Promise<void> {
  await getDb()
    .deleteFrom("attachments")
    .where("shop_id", "=", currentShopId())
    .where("id", "=", id)
    .execute();
}

export async function removeByOwner(ownerType: OwnerType, ownerId: number): Promise<void> {
  await getDb()
    .deleteFrom("attachments")
    .where("shop_id", "=", currentShopId())
    .where("owner_type", "=", ownerType)
    .where("owner_id", "=", ownerId)
    .execute();
}
