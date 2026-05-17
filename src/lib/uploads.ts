import multer from "multer";
import sharp from "sharp";
import { extname } from "path";
import { randomBytes } from "crypto";
import { getStorage } from "./storage";

export type OwnerType = "employee" | "guarantor";

// Multer: memory storage (we hand the buffer to the Storage backend), 5MB limit,
// image+pdf only.
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

// Persist a multer file to the active Storage backend. For images, also write
// a 240px-wide WebP thumbnail named `thumb_<basename>.webp`.
export async function storeFile(
  ownerType: OwnerType,
  ownerId: number,
  file: Express.Multer.File,
): Promise<StoredFile> {
  const ext = (extname(file.originalname) || "").toLowerCase() || mimeExt(file.mimetype);
  const slug = randomBytes(8).toString("hex");
  const filename = `${slug}${ext}`;
  const storage = getStorage();

  if (file.mimetype.startsWith("image/")) {
    const mainBuf = await sharp(file.buffer).rotate().toBuffer();
    await storage.put({ ownerType, ownerId, filename, body: mainBuf, contentType: file.mimetype });
    const thumbName = `thumb_${slug}.webp`;
    const thumbBuf = await sharp(file.buffer).rotate().resize({ width: 240, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
    await storage.put({ ownerType, ownerId, filename: thumbName, body: thumbBuf, contentType: "image/webp" });
    return { filename, thumbnail: thumbName, size: mainBuf.length, mime: file.mimetype };
  } else {
    // PDF — write raw buffer
    await storage.put({ ownerType, ownerId, filename, body: file.buffer, contentType: file.mimetype });
    return { filename, thumbnail: null, size: file.size, mime: file.mimetype };
  }
}

export async function deleteFile(
  ownerType: OwnerType,
  ownerId: number,
  filename: string,
  thumbnail: string | null,
): Promise<void> {
  const storage = getStorage();
  await Promise.allSettled([
    storage.delete(ownerType, ownerId, filename),
    thumbnail ? storage.delete(ownerType, ownerId, thumbnail) : Promise.resolve(),
  ]);
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
