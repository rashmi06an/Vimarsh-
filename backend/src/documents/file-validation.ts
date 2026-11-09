/**
 * Validates a file by its ACTUAL content (magic bytes), not the client-supplied MIME or name.
 * This prevents e.g. an executable renamed to .pdf from being accepted.
 */
export interface DetectedType {
  ext: string;
  mime: string;
}

/** The subset of a multer file we use (avoids Express.Multer global-type friction). */
export interface UploadedFileLike {
  originalname: string;
  buffer: Buffer;
  size: number;
  mimetype: string;
}

const EXT_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

export const ALLOWED_EXTS = Object.keys(EXT_TO_MIME);

function startsWith(buf: Buffer, bytes: number[]): boolean {
  if (buf.length < bytes.length) return false;
  return bytes.every((b, i) => buf[i] === b);
}

/**
 * Returns the validated type if the content matches the declared extension, else null.
 * Office formats (docx/xlsx/pptx) are ZIP containers, so we require the ZIP signature and
 * trust the declared office subtype (documented limitation — we do not unzip to confirm subtype).
 */
export function validateFile(fileName: string, buffer: Buffer): DetectedType | null {
  const ext = (fileName.split('.').pop() ?? '').toLowerCase();
  if (!ALLOWED_EXTS.includes(ext)) return null;

  const isPdf = startsWith(buffer, [0x25, 0x50, 0x44, 0x46]); // %PDF
  const isPng = startsWith(buffer, [0x89, 0x50, 0x4e, 0x47]);
  const isJpg = startsWith(buffer, [0xff, 0xd8, 0xff]);
  const isZip = startsWith(buffer, [0x50, 0x4b, 0x03, 0x04]); // PK.. (office xml)

  const ok =
    (ext === 'pdf' && isPdf) ||
    (ext === 'png' && isPng) ||
    ((ext === 'jpg' || ext === 'jpeg') && isJpg) ||
    ((ext === 'docx' || ext === 'xlsx' || ext === 'pptx') && isZip);

  if (!ok) return null;
  return { ext, mime: EXT_TO_MIME[ext] };
}
