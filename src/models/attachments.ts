import { _legacySqliteDb } from "../lib/db";

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
  const r = _legacySqliteDb().prepare(`
    INSERT INTO attachments (owner_type, owner_id, kind, filename, original_name, mime_type, size_bytes, uploaded_by)
    VALUES (@owner_type, @owner_id, @kind, @filename, @original_name, @mime_type, @size_bytes, @uploaded_by)
  `).run(input);
  return findById(Number(r.lastInsertRowid))!;
}

export function findById(id: number): Attachment | null {
  const r = _legacySqliteDb().prepare("SELECT * FROM attachments WHERE id = ?").get(id) as Attachment | undefined;
  return r ?? null;
}

export function findByOwner(ownerType: OwnerType, ownerId: number): Attachment[] {
  return _legacySqliteDb().prepare("SELECT * FROM attachments WHERE owner_type = ? AND owner_id = ? ORDER BY uploaded_at, id").all(ownerType, ownerId) as Attachment[];
}

export function findOneByKind(ownerType: OwnerType, ownerId: number, kind: AttachmentKind): Attachment | null {
  const r = _legacySqliteDb().prepare("SELECT * FROM attachments WHERE owner_type = ? AND owner_id = ? AND kind = ? ORDER BY uploaded_at DESC, id DESC LIMIT 1").get(ownerType, ownerId, kind) as Attachment | undefined;
  return r ?? null;
}

export function remove(id: number): void {
  _legacySqliteDb().prepare("DELETE FROM attachments WHERE id = ?").run(id);
}

export function removeByOwner(ownerType: OwnerType, ownerId: number): void {
  _legacySqliteDb().prepare("DELETE FROM attachments WHERE owner_type = ? AND owner_id = ?").run(ownerType, ownerId);
}
