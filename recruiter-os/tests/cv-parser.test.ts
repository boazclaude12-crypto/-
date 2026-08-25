import './setup';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { parseCvText, parsedCvToCandidateInput } from '../src/lib/ai/cv-parser';
import { extractText } from '../src/lib/documents/extract';

const HEBREW_CV = `דני כהן
נהג מקצועי | חיפה
טלפון: 052-1234567
מייל: dani.cohen@example.com

ניסיון תעסוקתי
נהג חלוקה | תובלה ישראלית | 2019 - היום
חלוקה יומית ללקוחות עסקיים באזור הצפון, אחריות על העמסה ופריקה.
נהג מחסן | מחסני הצפון | 2015 - 2019

רישיונות
רישיון C, רישיון B

הסמכות
מלגזה, עזרה ראשונה

השכלה
תיכונית מלאה + בגרות

שפות
עברית, ערבית
`;

describe('CV parser', () => {
  test('extracts the identifying fields from a Hebrew CV', () => {
    const parsed = parseCvText(HEBREW_CV);
    assert.equal(parsed.first_name, 'דני');
    assert.equal(parsed.last_name, 'כהן');
    assert.equal(parsed.phone, '+972521234567', 'phone must be normalised to E.164');
    assert.equal(parsed.email, 'dani.cohen@example.com');
    assert.equal(parsed.city, 'חיפה');
    assert.equal(parsed.region, 'haifa');
  });

  test('extracts licences, certifications and languages', () => {
    const parsed = parseCvText(HEBREW_CV);
    assert.ok(parsed.licenses.includes('רישיון C'));
    assert.ok(parsed.licenses.includes('רישיון B'));
    assert.ok(parsed.certifications.includes('מלגזה'));
    assert.ok(parsed.languages.includes('עברית'));
    assert.ok(parsed.languages.includes('ערבית'));
  });

  test('reads employment history including the current position', () => {
    const parsed = parseCvText(HEBREW_CV);
    assert.ok(parsed.experiences.length >= 2, 'both positions must be found');
    assert.ok(parsed.experiences.some((experience) => experience.is_current));
    assert.equal(parsed.current_role, 'נהג חלוקה');
    assert.ok((parsed.years_experience ?? 0) > 0);
  });

  test('never invents data: absent fields stay null and are listed as missing', () => {
    const parsed = parseCvText('יוסי לוי\nמחפש עבודה');
    assert.equal(parsed.email, null);
    assert.equal(parsed.phone, null);
    assert.equal(parsed.education, null);
    assert.deepEqual(parsed.licenses, []);
    assert.deepEqual(parsed.certifications, []);
    assert.ok(parsed.missing.includes('טלפון'));
    assert.ok(parsed.missing.includes('אימייל'));
    assert.ok(parsed.confidence < 60, 'a sparse CV must report low confidence');
  });

  test('maps a parsed CV onto the candidate form payload', () => {
    const input = parsedCvToCandidateInput(parseCvText(HEBREW_CV));
    assert.equal(input.first_name, 'דני');
    assert.ok(input.attributes.some((attribute) => attribute.kind === 'license'));
    assert.ok(input.experiences.length >= 2);
    assert.ok(input.experiences.every((experience) => experience.title.length > 0));
  });
});

/** Builds a real (stored, uncompressed) .docx in memory so the ZIP reader is exercised. */
function buildDocx(paragraphs: string[]): Buffer {
  const xml =
    '<?xml version="1.0"?><w:document xmlns:w="x"><w:body>' +
    paragraphs.map((text) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`).join('') +
    '</w:body></w:document>';
  const content = Buffer.from(xml, 'utf8');
  const compressed = zlib.deflateRawSync(content);
  const name = Buffer.from('word/document.xml', 'utf8');

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(8, 8); // deflate
  local.writeUInt32LE(zlib.crc32 ? zlib.crc32(content) : 0, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);

  return Buffer.concat([local, name, compressed, central, name, end]);
}

describe('document text extraction', () => {
  test('reads a DOCX file', () => {
    const result = extractText(buildDocx(['דני כהן', 'רישיון C']), '', 'cv.docx');
    assert.equal(result.status, 'parsed');
    assert.ok(result.text.includes('דני כהן'));
    assert.ok(result.text.includes('רישיון C'));
  });

  test('reads plain text', () => {
    const result = extractText(Buffer.from(HEBREW_CV, 'utf8'), 'text/plain', 'cv.txt');
    assert.equal(result.status, 'parsed');
    assert.ok(result.text.includes('052-1234567'));
  });

  test('reports unsupported formats instead of returning empty text', () => {
    const result = extractText(Buffer.from('anything'), 'application/msword', 'old.doc');
    assert.equal(result.status, 'unsupported');
    assert.ok(result.reason && result.reason.length > 0, 'the user must be told why');
    assert.equal(result.text, '');
  });

  test('reports a PDF it cannot read rather than pretending it parsed', () => {
    const result = extractText(Buffer.from('%PDF-1.4 not really a pdf'), 'application/pdf', 'scan.pdf');
    assert.notEqual(result.status, 'parsed');
    assert.ok(result.reason);
  });
});
