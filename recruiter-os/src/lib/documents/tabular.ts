import { readZipEntry } from './extract';

export interface Sheet {
  headers: string[];
  rows: string[][];
  /** Rows dropped because the file exceeded the cap. */
  truncated: number;
}

export const MAX_IMPORT_ROWS = 2000;

/**
 * Splits one CSV line, honouring quoted fields.
 *
 * Written out rather than split on the delimiter because a recruiter's export routinely
 * contains an address with a comma in it, and a naive split silently shifts every column
 * after it — the kind of corruption nobody notices until the phone numbers are wrong.
 */
function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * Guesses the delimiter from the header line.
 *
 * Excel writes a semicolon-separated file on locales where the comma is the decimal mark,
 * which is most of Europe and is what a Hebrew Windows install produces. Guessing wrong
 * yields one enormous column and an import that looks broken for no visible reason.
 */
function sniffDelimiter(firstLine: string): string {
  const counts = [',', ';', '\t'].map((candidate) => ({
    candidate,
    // Count only outside quotes, so a quoted "כהן, דני" does not win the vote.
    count: firstLine.replace(/"[^"]*"/g, '').split(candidate).length - 1,
  }));
  return counts.sort((a, b) => b.count - a.count)[0]!.count > 0
    ? counts.sort((a, b) => b.count - a.count)[0]!.candidate
    : ',';
}

const XML_ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'",
};

function decodeXml(value: string): string {
  return value
    .replace(/&(amp|lt|gt|quot|apos);/g, (entity) => XML_ENTITIES[entity]!)
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)));
}

/** Column letters to a zero-based index: A→0, Z→25, AA→26. */
function columnIndex(reference: string): number {
  const letters = reference.match(/^[A-Z]+/)?.[0] ?? 'A';
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

/**
 * Reads the first worksheet of an .xlsx file.
 *
 * A workbook is a ZIP of XML, and the ZIP reader already exists for .docx — so the whole
 * format costs one file rather than a dependency tree. Only what an import needs is read:
 * the shared string table and the cells of the first sheet.
 */
function parseXlsx(buffer: Buffer): string[][] | null {
  const sheetXml = (
    readZipEntry(buffer, 'xl/worksheets/sheet1.xml') ?? readZipEntry(buffer, 'xl/worksheets/sheet.xml')
  )?.toString('utf8');
  if (!sheetXml) return null;

  // Text is pooled in a shared table and referenced by index from the cells.
  const sharedXml = readZipEntry(buffer, 'xl/sharedStrings.xml')?.toString('utf8') ?? '';
  const shared: string[] = [];
  for (const item of sharedXml.match(/<si>[\s\S]*?<\/si>/g) ?? []) {
    const parts = item.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? [];
    shared.push(parts.map((part) => decodeXml(part.replace(/<[^>]+>/g, ''))).join(''));
  }

  const rows: string[][] = [];
  for (const rowXml of sheetXml.match(/<row[^>]*>[\s\S]*?<\/row>/g) ?? []) {
    const cells: string[] = [];
    for (const cellXml of rowXml.match(/<c[^>]*\/>|<c[^>]*>[\s\S]*?<\/c>/g) ?? []) {
      const reference = cellXml.match(/r="([A-Z]+\d+)"/)?.[1];
      const index = reference ? columnIndex(reference) : cells.length;
      const type = cellXml.match(/t="([^"]+)"/)?.[1];

      let value = '';
      if (type === 's') {
        const pointer = Number(cellXml.match(/<v>(\d+)<\/v>/)?.[1] ?? -1);
        value = shared[pointer] ?? '';
      } else if (type === 'inlineStr') {
        value = decodeXml((cellXml.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? '').replace(/<[^>]+>/g, ''));
      } else {
        value = decodeXml(cellXml.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '');
      }

      // Blank cells are omitted from the XML entirely, so gaps have to be filled by
      // position or every column after an empty cell shifts left.
      while (cells.length < index) cells.push('');
      cells[index] = value;
    }
    rows.push(cells);
  }
  return rows;
}

/**
 * Reads a spreadsheet or CSV into a header row and data rows.
 *
 * Leading blank lines are skipped: exports often carry a title or a filter description
 * above the real header, and treating that as the header makes every column unmappable.
 */
export function readSheet(buffer: Buffer, fileName: string): Sheet | null {
  const isExcel = /\.xlsx$/i.test(fileName);
  let grid: string[][] | null;

  if (isExcel) {
    grid = parseXlsx(buffer);
  } else {
    const text = buffer.toString('utf8').replace(/^﻿/, '');
    const firstLine = text.slice(0, text.indexOf('\n') === -1 ? text.length : text.indexOf('\n'));
    grid = parseCsv(text, sniffDelimiter(firstLine));
  }
  if (!grid) return null;

  const cleaned = grid.map((row) => row.map((cell) => cell.trim()));
  const headerIndex = cleaned.findIndex((row) => row.filter(Boolean).length >= 2);
  if (headerIndex === -1) return null;

  const headers = cleaned[headerIndex]!;
  const body = cleaned
    .slice(headerIndex + 1)
    .filter((row) => row.some(Boolean))
    .map((row) => {
      const padded = row.slice(0, headers.length);
      while (padded.length < headers.length) padded.push('');
      return padded;
    });

  return {
    headers,
    rows: body.slice(0, MAX_IMPORT_ROWS),
    truncated: Math.max(0, body.length - MAX_IMPORT_ROWS),
  };
}
