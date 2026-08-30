import zlib from 'node:zlib';

/**
 * Text extraction for the CV formats recruiters actually receive.
 *
 * Implemented directly against the file formats (no third-party parser) so uploads work
 * offline and nothing is sent anywhere. Unsupported files are reported as such rather
 * than silently producing empty text.
 */
export type ExtractStatus = 'parsed' | 'unsupported' | 'failed';

export interface ExtractResult {
  status: ExtractStatus;
  text: string;
  reason?: string;
}

export const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/rtf',
  'application/rtf',
];

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function cleanup(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_CHARS, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* ------------------------------- PDF ------------------------------- */

function decodePdfString(raw: string): string {
  let out = '';
  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i]!;
    if (char !== '\\') {
      out += char;
      continue;
    }
    const next = raw[i + 1];
    if (next === undefined) break;
    if (next >= '0' && next <= '7') {
      const octal = raw.slice(i + 1, i + 4).match(/^[0-7]{1,3}/)?.[0] ?? '';
      out += String.fromCharCode(parseInt(octal, 8));
      i += octal.length;
      continue;
    }
    const escapes: Record<string, string> = {
      n: '\n', r: '\n', t: '\t', b: '', f: '', '(': '(', ')': ')', '\\': '\\',
    };
    out += escapes[next] ?? next;
    i += 1;
  }
  return out;
}

/** UTF-16BE strings (how Hebrew is usually written) appear as <FEFF...> hex literals. */
function decodeHexString(hex: string): string {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '');
  const bytes = Buffer.from(clean.length % 2 ? `${clean}0` : clean, 'hex');
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return Buffer.from(bytes.subarray(2)).swap16().toString('utf16le');
  }
  return bytes.toString('latin1');
}

function textFromPdfContent(content: string): string {
  let out = '';
  const operatorRe =
    /(\((?:[^()\\]|\\.)*\)|<[0-9a-fA-F\s]*>)\s*(?:Tj|'|")|\[((?:[^\][]|\\.)*)\]\s*TJ|(T\*|Td|TD|ET)/g;

  let match: RegExpExecArray | null;
  while ((match = operatorRe.exec(content)) !== null) {
    if (match[3]) {
      out += '\n';
      continue;
    }
    if (match[2] !== undefined) {
      const parts = match[2].match(/\((?:[^()\\]|\\.)*\)|<[0-9a-fA-F\s]*>/g) ?? [];
      for (const part of parts) {
        out += part.startsWith('<')
          ? decodeHexString(part.slice(1, -1))
          : decodePdfString(part.slice(1, -1));
      }
      out += ' ';
      continue;
    }
    if (match[1]) {
      out += match[1].startsWith('<')
        ? decodeHexString(match[1].slice(1, -1))
        : decodePdfString(match[1].slice(1, -1));
      out += ' ';
    }
  }
  return out;
}

function extractPdf(buffer: Buffer): ExtractResult {
  const raw = buffer.toString('latin1');
  let collected = '';

  // Content streams may be Flate-compressed or stored as-is; try both.
  const streamRe = /stream\r?\n?([\s\S]*?)endstream/g;
  let match: RegExpExecArray | null;
  while ((match = streamRe.exec(raw)) !== null) {
    const chunk = Buffer.from(match[1]!, 'latin1');
    let content: string | null = null;
    try {
      content = zlib.inflateSync(chunk).toString('latin1');
    } catch {
      try {
        content = zlib.inflateRawSync(chunk).toString('latin1');
      } catch {
        content = /\bTj\b|\bTJ\b/.test(match[1]!) ? match[1]! : null;
      }
    }
    if (content) collected += `${textFromPdfContent(content)}\n`;
  }

  const text = cleanup(collected);
  if (!text) {
    return {
      status: 'failed',
      text: '',
      reason: 'לא הצלחתי לחלץ טקסט מה-PDF (ייתכן שזה קובץ סרוק). אפשר להזין את הפרטים ידנית.',
    };
  }
  return { status: 'parsed', text };
}

/* ------------------------------- DOCX ------------------------------ */

const LOCAL_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const CENTRAL_HEADER = Buffer.from([0x50, 0x4b, 0x01, 0x02]);

/** Minimal ZIP reader: walks local file headers and inflates the entry we need. */
export function readZipEntry(buffer: Buffer, wantedName: string): Buffer | null {
  let offset = 0;
  while (offset >= 0 && offset < buffer.length - 30) {
    if (buffer.readUInt32LE(offset) !== 0x04034b50) {
      const next = buffer.indexOf(LOCAL_HEADER, offset + 1);
      if (next === -1) return null;
      offset = next;
      continue;
    }
    const flags = buffer.readUInt16LE(offset + 6);
    const compression = buffer.readUInt16LE(offset + 8);
    let compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString('utf8');
    const dataStart = nameStart + nameLength + extraLength;

    if ((flags & 0x08) !== 0 || compressedSize === 0) {
      // Size lives in a trailing data descriptor: read up to the next header instead.
      const nextLocal = buffer.indexOf(LOCAL_HEADER, dataStart);
      const nextCentral = buffer.indexOf(CENTRAL_HEADER, dataStart);
      const end = nextLocal === -1 ? nextCentral : nextLocal;
      compressedSize = Math.max(0, (end === -1 ? buffer.length : end) - dataStart - 16);
    }

    if (name === wantedName) {
      const data = buffer.subarray(dataStart, dataStart + compressedSize);
      try {
        return compression === 0 ? Buffer.from(data) : zlib.inflateRawSync(data);
      } catch {
        return null;
      }
    }
    offset = dataStart + compressedSize;
  }
  return null;
}

function extractDocx(buffer: Buffer): ExtractResult {
  const document = readZipEntry(buffer, 'word/document.xml');
  if (!document) {
    return { status: 'failed', text: '', reason: 'הקובץ אינו DOCX תקין או שאינו ניתן לקריאה.' };
  }
  const xml = document.toString('utf8');
  const text = cleanup(
    xml
      .replace(/<w:tab[^>]*\/>/g, '\t')
      .replace(/<w:br[^>]*\/>/g, '\n')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&'),
  );
  if (!text) return { status: 'failed', text: '', reason: 'המסמך ריק.' };
  return { status: 'parsed', text };
}

/* -------------------------------- RTF ------------------------------- */

function extractRtf(buffer: Buffer): ExtractResult {
  const raw = buffer.toString('latin1');
  const text = cleanup(
    raw
      .replace(/\\'([0-9a-fA-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\u(-?\d+)\??/g, (_, code: string) => {
        const value = Number(code);
        return String.fromCharCode(value < 0 ? value + 65536 : value);
      })
      .replace(/\\par[d]?/g, '\n')
      .replace(/\{\\\*[^}]*\}/g, '')
      .replace(/\\[a-zA-Z]+-?\d*\s?/g, '')
      .replace(/[{}]/g, ''),
  );
  return text ? { status: 'parsed', text } : { status: 'failed', text: '', reason: 'לא נמצא טקסט בקובץ.' };
}

/* ------------------------------- entry ------------------------------ */

export function extractText(buffer: Buffer, mimeType: string, fileName = ''): ExtractResult {
  const lowerName = fileName.toLowerCase();
  const type = mimeType.toLowerCase();

  try {
    if (type === 'application/pdf' || lowerName.endsWith('.pdf')) return extractPdf(buffer);
    if (
      type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      lowerName.endsWith('.docx')
    ) {
      return extractDocx(buffer);
    }
    if (type.includes('rtf') || lowerName.endsWith('.rtf')) return extractRtf(buffer);
    if (type.startsWith('text/') || lowerName.endsWith('.txt')) {
      return { status: 'parsed', text: cleanup(buffer.toString('utf8')) };
    }
    if (lowerName.endsWith('.doc')) {
      return {
        status: 'unsupported',
        text: '',
        reason: 'פורמט DOC ישן אינו נתמך. שמור כ-PDF או DOCX ונסה שוב.',
      };
    }
  } catch (error) {
    return {
      status: 'failed',
      text: '',
      reason: error instanceof Error ? error.message : 'שגיאה בקריאת הקובץ',
    };
  }

  return { status: 'unsupported', text: '', reason: 'סוג קובץ לא נתמך. נתמכים: PDF, DOCX, TXT, RTF.' };
}
