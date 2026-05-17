import "dotenv/config";
import { readdir, readFile } from "fs/promises";
import { join, resolve, extname } from "path";
import { getSupabaseClient, storageBucket } from "../src/lib/supabase";

const ROOT = resolve(process.cwd(), "data/uploads");

const MIME_BY_EXT: Record<string, string> = {
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif":  "image/gif",
  ".pdf":  "application/pdf",
};

async function walk(dir: string, base = ""): Promise<Array<{ key: string; absPath: string }>> {
  const out: Array<{ key: string; absPath: string }> = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const abs = join(dir, e.name);
    const key = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) {
      const sub = await walk(abs, key);
      out.push(...sub);
    } else if (e.isFile()) {
      out.push({ key, absPath: abs });
    }
  }
  return out;
}

function mimeFor(path: string): string {
  return MIME_BY_EXT[extname(path).toLowerCase()] ?? "application/octet-stream";
}

async function main() {
  const client = getSupabaseClient();
  const bucket = storageBucket();
  console.log(`Reading from: ${ROOT}`);
  console.log(`Uploading to: ${bucket}`);

  const files = await walk(ROOT);
  if (files.length === 0) {
    console.log("No files to upload.");
    return;
  }
  console.log(`Found ${files.length} files.`);

  let ok = 0;
  let failed = 0;
  for (const f of files) {
    const buf = await readFile(f.absPath);
    const { error } = await client.storage.from(bucket).upload(f.key, buf, {
      contentType: mimeFor(f.absPath),
      upsert: true,
    });
    if (error) {
      console.error(`FAILED ${f.key}: ${error.message}`);
      failed++;
    } else {
      ok++;
    }
  }
  console.log(`Uploaded ${ok}/${files.length} files (${failed} failed).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
