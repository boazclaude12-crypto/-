import fs from 'node:fs';
import path from 'node:path';
import { env } from '../env';
import { newId } from '../ids';
import { ApiError } from '../errors';
import { MAX_UPLOAD_BYTES } from './extract';

/**
 * Files worth keeping on a candidate, which is a wider set than the files we can read.
 *
 * A CV photographed and sent on WhatsApp is the most common form an application takes on
 * a staffing desk, and no parser will ever read it. Storing it anyway keeps the lead: the
 * recruiter opens the picture and reads it themselves, which is what they would have done
 * in WhatsApp regardless.
 */
const ALLOWED_EXTENSIONS = new Set([
  '.pdf', '.docx', '.txt', '.rtf', '.doc',
  '.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif',
]);

export interface StoredFile {
  storedName: string;
  fileName: string;
  mimeType: string;
  size: number;
  buffer: Buffer;
}

/**
 * Validates and stores an uploaded CV.
 *
 * Files live outside /public and are keyed by a generated name, so the only way to read
 * one back is through the authenticated download route, which re-checks org ownership.
 * The original filename is never used on disk — it is attacker-controlled.
 */
export async function storeUpload(orgId: string, file: File): Promise<StoredFile> {
  if (file.size === 0) throw new ApiError(400, 'הקובץ ריק');
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ApiError(413, `הקובץ גדול מדי. מקסימום ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB.`);
  }

  const originalName = path.basename(file.name || 'cv').replace(/[\u0000-\u001F\/\\]/g, '').slice(0, 160);
  const extension = path.extname(originalName).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new ApiError(415, 'סוג קובץ לא נתמך. נתמכים: PDF, DOCX, TXT, RTF ותמונות.');
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const storedName = `${orgId}/${newId('file')}${extension}`;
  const target = path.join(env.uploadDir, storedName);

  // Defence in depth: the resolved path must stay inside the upload directory.
  const resolved = path.resolve(target);
  if (!resolved.startsWith(path.resolve(env.uploadDir) + path.sep)) {
    throw new ApiError(400, 'נתיב קובץ לא חוקי');
  }

  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, buffer, { mode: 0o600 });

  return {
    storedName,
    fileName: originalName,
    mimeType: file.type || 'application/octet-stream',
    size: buffer.length,
    buffer,
  };
}

export function readStoredFile(storedName: string): Buffer | null {
  const resolved = path.resolve(path.join(env.uploadDir, storedName));
  if (!resolved.startsWith(path.resolve(env.uploadDir) + path.sep)) return null;
  if (!fs.existsSync(resolved)) return null;
  return fs.readFileSync(resolved);
}

export function deleteStoredFile(storedName: string): void {
  const resolved = path.resolve(path.join(env.uploadDir, storedName));
  if (!resolved.startsWith(path.resolve(env.uploadDir) + path.sep)) return;
  if (fs.existsSync(resolved)) fs.unlinkSync(resolved);
}
