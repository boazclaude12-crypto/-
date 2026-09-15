import './setup';
import { createOrg } from './setup';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readSheet } from '../src/lib/documents/tabular';
import { guessMapping } from '../src/lib/domain/import-map';
import { importRows } from '../src/lib/domain/candidate-import';
import { getCandidateDetail } from '../src/lib/domain/candidates';

const HEBREW_CSV = `שם מלא,טלפון,עיר,תפקיד,שנות ניסיון,רישיונות,רכב
דני כהן,052-1234567,חיפה,נהג חלוקה,5,"רישיון C, מלגזה",כן
מיכל ברק,054-9876543,נתניה,מנהלת מחסן,8,אקסל,לא
`;

describe('reading a recruiter spreadsheet', () => {
  test('reads a Hebrew CSV with its header row', () => {
    const sheet = readSheet(Buffer.from(HEBREW_CSV, 'utf8'), 'candidates.csv')!;
    assert.equal(sheet.headers[0], 'שם מלא');
    assert.equal(sheet.rows.length, 2);
    assert.equal(sheet.rows[0]![1], '052-1234567');
  });

  test('a comma inside a quoted cell does not shift the columns', () => {
    const sheet = readSheet(Buffer.from(HEBREW_CSV, 'utf8'), 'c.csv')!;
    // "רישיון C, מלגזה" is one cell; a naive split would push רכב out of its column.
    assert.equal(sheet.rows[0]![5], 'רישיון C, מלגזה');
    assert.equal(sheet.rows[0]![6], 'כן');
  });

  test('a semicolon-separated export is read too', () => {
    // Excel writes these on locales where the comma is the decimal mark.
    const sheet = readSheet(Buffer.from('שם;טלפון;עיר\nדני;0521111111;חיפה', 'utf8'), 'x.csv')!;
    assert.deepEqual(sheet.headers, ['שם', 'טלפון', 'עיר']);
    assert.equal(sheet.rows[0]![2], 'חיפה');
  });

  test('a byte-order mark does not corrupt the first header', () => {
    const sheet = readSheet(Buffer.from('﻿שם,טלפון\nדני,0521111111', 'utf8'), 'x.csv')!;
    assert.equal(sheet.headers[0], 'שם');
  });

  test('a title line above the header is skipped', () => {
    const sheet = readSheet(Buffer.from('מאגר מועמדים 2026\n\nשם,טלפון\nדני,0521111111', 'utf8'), 'x.csv')!;
    assert.deepEqual(sheet.headers, ['שם', 'טלפון']);
    assert.equal(sheet.rows.length, 1);
  });
});

describe('column mapping', () => {
  test('guesses Hebrew headers without the user touching anything', () => {
    const mapping = guessMapping(['שם מלא', 'טלפון', 'עיר', 'תפקיד', 'שנות ניסיון', 'רישיונות', 'רכב']);
    assert.equal(mapping[0], 'full_name');
    assert.equal(mapping[1], 'phone');
    assert.equal(mapping[2], 'city');
    assert.equal(mapping[3], 'current_role');
    assert.equal(mapping[4], 'years_experience');
    assert.equal(mapping[5], 'skills');
    assert.equal(mapping[6], 'has_car');
  });

  test('guesses English headers too', () => {
    const mapping = guessMapping(['First Name', 'Last Name', 'Mobile', 'Email', 'City']);
    assert.equal(mapping[0], 'first_name');
    assert.equal(mapping[1], 'last_name');
    assert.equal(mapping[2], 'phone');
    assert.equal(mapping[3], 'email');
  });

  test('a column it cannot place is left unmapped rather than guessed', () => {
    const mapping = guessMapping(['שם', 'מקור הגעה ומידע נוסף שלא ברור']);
    assert.equal(mapping[1], '');
  });
});

describe('importing rows', () => {
  const MAPPING = {
    0: 'full_name', 1: 'phone', 2: 'city', 3: 'current_role',
    4: 'years_experience', 5: 'skills', 6: 'has_car',
  } as const;

  test('creates candidates with the details the sheet carried', async () => {
    const { orgId, userId } = await createOrg();
    const sheet = readSheet(Buffer.from(HEBREW_CSV, 'utf8'), 'c.csv')!;
    const { summary, results } = importRows(orgId, userId, sheet.rows, { ...MAPPING });

    assert.equal(summary.created, 2);
    const detail = getCandidateDetail(orgId, results[0]!.candidateId!)!;
    assert.equal(detail.candidate.first_name, 'דני');
    assert.equal(detail.candidate.last_name, 'כהן');
    assert.equal(detail.candidate.city, 'חיפה');
    assert.equal(detail.candidate.phone, '+972521234567');
    assert.equal(detail.candidate.has_car, 1);
    // Licences must land as attributes, or the imported candidate can never match a job.
    assert.equal(detail.attributes.length, 2);
  });

  test('a candidate already on file is reported, not duplicated', async () => {
    const { orgId, userId } = await createOrg();
    const sheet = readSheet(Buffer.from(HEBREW_CSV, 'utf8'), 'c.csv')!;
    importRows(orgId, userId, sheet.rows, { ...MAPPING });
    const second = importRows(orgId, userId, sheet.rows, { ...MAPPING });

    assert.equal(second.summary.created, 0);
    assert.equal(second.summary.duplicates, 2);
  });

  test('the same person listed twice in one file yields one record', async () => {
    const { orgId, userId } = await createOrg();
    const rows = [
      ['דני כהן', '052-1234567', 'חיפה', '', '', '', ''],
      ['דני כהן', '0521234567', 'חיפה', '', '', '', ''],
    ];
    const { summary } = importRows(orgId, userId, rows, { ...MAPPING });
    assert.equal(summary.created, 1);
    assert.equal(summary.duplicates, 1);
  });

  test('a row with nothing to identify is skipped, not filed empty', async () => {
    const { orgId, userId } = await createOrg();
    const { summary, results } = importRows(orgId, userId, [['', '', 'חיפה', '', '', '', '']], { ...MAPPING });
    assert.equal(summary.created, 0);
    assert.equal(summary.skipped, 1);
    assert.ok(results[0]!.reason?.includes('פרטי קשר'));
  });

  test('one org never de-duplicates against another', async () => {
    const a = await createOrg();
    const b = await createOrg();
    const sheet = readSheet(Buffer.from(HEBREW_CSV, 'utf8'), 'c.csv')!;
    importRows(a.orgId, a.userId, sheet.rows, { ...MAPPING });
    const inB = importRows(b.orgId, b.userId, sheet.rows, { ...MAPPING });
    assert.equal(inB.summary.created, 2);
  });
});

/**
 * Builds a minimal .xlsx: a store-mode ZIP of the two XML parts a workbook needs.
 * Written out rather than committed as a binary blob so the fixture is readable, and so
 * the ZIP reader is exercised on real headers rather than on something it produced.
 */
function buildXlsx(rows: string[][]): Buffer {
  const shared: string[] = [];
  const indexOf = (value: string) => {
    const at = shared.indexOf(value);
    return at === -1 ? shared.push(value) - 1 : at;
  };
  const column = (index: number) => {
    let name = '';
    let n = index + 1;
    while (n > 0) {
      const remainder = (n - 1) % 26;
      name = String.fromCharCode(65 + remainder) + name;
      n = Math.floor((n - 1) / 26);
    }
    return name;
  };

  const sheetRows = rows
    .map((row, rowIndex) => {
      const cells = row
        // Blank cells are omitted entirely by Excel — that is what shifts columns.
        .map((value, cellIndex) =>
          value === ''
            ? ''
            : `<c r="${column(cellIndex)}${rowIndex + 1}" t="s"><v>${indexOf(value)}</v></c>`,
        )
        .join('');
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join('');

  const sheetXml = `<?xml version="1.0"?><worksheet><sheetData>${sheetRows}</sheetData></worksheet>`;
  const sharedXml = `<?xml version="1.0"?><sst count="${shared.length}">${shared
    .map((value) => `<si><t>${value.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</t></si>`)
    .join('')}</sst>`;

  const entries = [
    { name: 'xl/sharedStrings.xml', data: Buffer.from(sharedXml, 'utf8') },
    { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(sheetXml, 'utf8') },
  ];

  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(0, 14); // crc, unchecked by the reader
    local.writeUInt32LE(entry.data.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    chunks.push(local, name, entry.data);

    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt32LE(entry.data.length, 20);
    header.writeUInt32LE(entry.data.length, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt32LE(offset, 42);
    central.push(header, name);
    offset += 30 + name.length + entry.data.length;
  }

  const body = Buffer.concat(chunks);
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(body.length, 16);

  return Buffer.concat([body, directory, end]);
}

describe('reading an Excel workbook', () => {
  const WORKBOOK = [
    ['שם מלא', 'טלפון', 'עיר', 'רישיונות', 'רכב'],
    ['דני כהן', '052-1234567', 'חיפה', 'רישיון C', 'כן'],
    ['אבי לוי', '053-5555555', '', '', 'כן'],
  ];

  test('reads an .xlsx without any spreadsheet library', () => {
    const sheet = readSheet(buildXlsx(WORKBOOK), 'candidates.xlsx')!;
    assert.ok(sheet, 'the workbook must be readable');
    assert.deepEqual(sheet.headers, WORKBOOK[0]);
    assert.equal(sheet.rows.length, 2);
    assert.equal(sheet.rows[0]![1], '052-1234567');
  });

  test('an empty cell keeps the columns after it in place', () => {
    // Excel omits blank cells from the XML, so position has to come from the cell
    // reference — otherwise "כן" would land in the town column.
    const sheet = readSheet(buildXlsx(WORKBOOK), 'candidates.xlsx')!;
    assert.deepEqual(sheet.rows[1], ['אבי לוי', '053-5555555', '', '', 'כן']);
  });

  test('an Excel import creates candidates end to end', async () => {
    const { orgId, userId } = await createOrg();
    const sheet = readSheet(buildXlsx(WORKBOOK), 'candidates.xlsx')!;
    const mapping = guessMapping(sheet.headers);
    const { summary } = importRows(orgId, userId, sheet.rows, mapping);
    assert.equal(summary.created, 2);
  });
});
