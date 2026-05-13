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
    if (ok) cb(null, true);
    else cb(new Error("Only PNG/JPG/WEBP/GIF/PDF allowed"));
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
