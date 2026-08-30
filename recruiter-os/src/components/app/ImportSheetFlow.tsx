'use client';

import React, { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, ErrorNote, Select, Spinner, cx } from '../ui';
import { Icon } from '../ui/icons';
import { api, errorMessage } from '../../lib/client/api';
import { useToast } from '../ui/Toast';
import { IMPORT_FIELDS, type ImportField } from '../../lib/domain/import-map';

interface Preview {
  headers: string[];
  rows: string[][];
  mapping: Record<string, ImportField | ''>;
  truncated: number;
  maxRows: number;
}

interface RowResult {
  row: number;
  status: 'created' | 'duplicate' | 'skipped';
  candidateId: string | null;
  name: string;
  reason: string | null;
}

interface ImportResult {
  summary: { total: number; created: number; duplicates: number; skipped: number };
  results: RowResult[];
}

const STATUS_META: Record<RowResult['status'], { tone: 'emerald' | 'sky' | 'amber'; label: string }> = {
  created: { tone: 'emerald', label: 'נוסף' },
  duplicate: { tone: 'sky', label: 'כבר קיים' },
  skipped: { tone: 'amber', label: 'דולג' },
};

/**
 * Brings a recruiter's existing spreadsheet in.
 *
 * Three steps and no typing: the file is read, the columns are matched by their headers,
 * and the first rows are shown as they will be filed. The mapping is always visible even
 * when every column was recognised — a column silently pointed at the wrong field puts
 * phone numbers in the salary column, and that is far harder to undo than to catch here.
 */
export function ImportSheetFlow({ onDone }: { onDone?: () => void } = {}) {
  const router = useRouter();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Record<string, ImportField | ''>>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function readFile(file: File) {
    setReading(true);
    setError(null);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await api.upload<Preview>('/api/candidates/import/preview', formData);
      setPreview(response);
      setMapping(response.mapping);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setReading(false);
    }
  }

  async function commit() {
    if (!preview) return;
    setImporting(true);
    setError(null);
    try {
      const response = await api.post<ImportResult>('/api/candidates/import', {
        rows: preview.rows,
        mapping,
      });
      setResult(response);
      if (response.summary.created > 0) {
        toast.success(`נוספו ${response.summary.created} מועמדים`);
        router.refresh();
      } else {
        toast.info('לא נוסף אף מועמד — ראה פירוט');
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setImporting(false);
    }
  }

  if (result) {
    return (
      <Card title="מה נקלט">
        <div className="flex flex-wrap gap-2">
          <Badge tone="emerald">{result.summary.created} נוספו</Badge>
          {result.summary.duplicates > 0 && <Badge tone="sky">{result.summary.duplicates} כבר קיימים</Badge>}
          {result.summary.skipped > 0 && <Badge tone="amber">{result.summary.skipped} דולגו</Badge>}
        </div>

        {result.results.some((row) => row.status !== 'created') && (
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
            {result.results
              .filter((row) => row.status !== 'created')
              .slice(0, 40)
              .map((row) => (
                <li key={row.row} className="flex items-center gap-3 px-3 py-2">
                  <span className="num w-10 shrink-0 text-xs text-faint">#{row.row}</span>
                  <Badge tone={STATUS_META[row.status].tone}>{STATUS_META[row.status].label}</Badge>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{row.name}</span>
                  <span className="truncate text-xs text-faint">{row.reason}</span>
                </li>
              ))}
          </ul>
        )}

        <div className="mt-3 flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setResult(null);
              setPreview(null);
            }}
          >
            ייבוא נוסף
          </Button>
          <Button
            onClick={() => {
              onDone?.();
              router.push('/candidates');
            }}
          >
            למאגר המועמדים
          </Button>
        </div>
      </Card>
    );
  }

  if (preview) {
    const mapped = Object.values(mapping).filter(Boolean).length;
    return (
      <div className="space-y-4">
        <Card title="התאמת עמודות">
          <p className="text-sm text-muted">
            זוהו {mapped} מתוך {preview.headers.length} עמודות. בדוק שכל עמודה מצביעה על השדה
            הנכון — עמודה שלא נדרשת אפשר להשאיר על &quot;לא מייבא&quot;.
          </p>
          {preview.truncated > 0 && (
            <p className="mt-2 rounded-lg bg-warn/10 px-3 py-2 text-sm text-warn">
              הקובץ מכיל יותר מ-{preview.maxRows} שורות. ייובאו {preview.rows.length} הראשונות;
              את היתר אפשר לייבא בקובץ נוסף.
            </p>
          )}
          <ErrorNote>{error}</ErrorNote>

          <div className="mt-3 space-y-2">
            {preview.headers.map((header, index) => (
              <div key={index} className="grid items-center gap-2 sm:grid-cols-[1fr_auto_1fr]">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{header || `עמודה ${index + 1}`}</p>
                  <p className="truncate text-xs text-faint">
                    {preview.rows.slice(0, 2).map((row) => row[index]).filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
                <Icon.ArrowLeft size={14} className="hidden text-faint sm:block" />
                <Select
                  options={IMPORT_FIELDS}
                  placeholder="לא מייבא"
                  value={mapping[index] ?? ''}
                  onChange={(event) =>
                    setMapping((current) => ({ ...current, [index]: event.target.value as ImportField | '' }))
                  }
                />
              </div>
            ))}
          </div>
        </Card>

        <Card title={`תצוגה מקדימה — ${preview.rows.length} שורות`} bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line">
                  {preview.headers.map((header, index) => (
                    <th key={index} className="whitespace-nowrap px-3 py-2 text-right text-xs font-medium text-faint">
                      {mapping[index]
                        ? IMPORT_FIELDS.find((field) => field.value === mapping[index])?.label
                        : <span className="opacity-50">לא מייבא</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 5).map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-b border-line last:border-0">
                    {row.map((cell, cellIndex) => (
                      <td
                        key={cellIndex}
                        className={cx(
                          'max-w-[14rem] truncate px-3 py-2',
                          mapping[cellIndex] ? 'text-ink' : 'text-faint opacity-50',
                        )}
                      >
                        {cell || '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setPreview(null)}>
            קובץ אחר
          </Button>
          <Button loading={importing} onClick={commit} icon={<Icon.Users size={16} />}>
            ייבוא {preview.rows.length} מועמדים
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Card>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files?.[0];
          if (file) void readFile(file);
        }}
        className={cx(
          'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition',
          dragging ? 'border-brand bg-brand-soft' : 'border-line',
        )}
      >
        {reading ? (
          <>
            <Spinner className="h-7 w-7 text-brand" />
            <p className="text-sm font-medium text-ink">קורא את הקובץ…</p>
          </>
        ) : (
          <>
            <Icon.Doc size={30} className="text-faint" />
            <div>
              <p className="text-sm font-semibold text-ink">גרור לכאן את הגיליון שלך</p>
              <p className="mt-1 text-sm text-muted">Excel (XLSX) או CSV — עד 2,000 שורות</p>
            </div>
            <Button variant="secondary" onClick={() => inputRef.current?.click()}>
              בחירת קובץ
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,.tsv,.txt"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void readFile(file);
              }}
            />
          </>
        )}
      </div>

      <ErrorNote>{error}</ErrorNote>

      <p className="mt-4 text-center text-xs text-faint">
        שורת הכותרות מזוהה אוטומטית, וגם עמודות בעברית. מועמד שכבר קיים לפי טלפון או אימייל
        לא ייווצר פעמיים.
      </p>
    </Card>
  );
}
