'use client';

import React, { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, ErrorNote, Spinner, Tabs, cx } from '../ui';
import { Icon } from '../ui/icons';
import { CandidateForm, EMPTY_CANDIDATE, type CandidateFormValues } from '../forms/CandidateForm';
import { ImportSheetFlow } from './ImportSheetFlow';
import { api, errorMessage } from '@/lib/client/api';
import { useToast } from '../ui/Toast';

interface ParsedCvResponse {
  status: 'parsed' | 'unsupported' | 'failed';
  reason: string | null;
  parsed: {
    missing: string[];
    confidence: number;
    licenses: string[];
    certifications: string[];
    skills: string[];
    experiences: Array<{ title: string; company: string }>;
  } | null;
  form: {
    first_name: string; last_name: string; phone: string | null; email: string | null;
    city: string | null; current_role: string | null; years_experience: number | null;
    education: string | null;
    attributes: Array<{ kind: string; value: string }>;
    experiences: Array<{
      company: string; title: string; start_date: string | null; end_date: string | null;
      is_current: boolean; description: string | null;
    }>;
    tags: string[];
  } | null;
  preview?: string;
}

interface BulkRow {
  fileName: string;
  status: 'created' | 'duplicate' | 'unreadable' | 'failed';
  candidateId: string | null;
  name: string | null;
  city: string | null;
  phone: string | null;
  missing: string[];
  reason: string | null;
}

interface BulkResponse {
  summary: { total: number; created: number; duplicates: number; unreadable: number; failed: number };
  results: BulkRow[];
}

const BULK_TONE: Record<BulkRow['status'], { tone: 'emerald' | 'sky' | 'amber' | 'rose'; label: string }> = {
  created: { tone: 'emerald', label: 'נוסף' },
  duplicate: { tone: 'sky', label: 'כבר קיים' },
  unreadable: { tone: 'amber', label: 'לא נקרא' },
  failed: { tone: 'rose', label: 'נכשל' },
};

function toFormValues(form: NonNullable<ParsedCvResponse['form']>): Partial<CandidateFormValues> {
  return {
    ...EMPTY_CANDIDATE,
    first_name: form.first_name ?? '',
    last_name: form.last_name ?? '',
    phone: form.phone ?? '',
    whatsapp: form.phone ?? '',
    email: form.email ?? '',
    city: form.city ?? '',
    current_role: form.current_role ?? '',
    years_experience: form.years_experience != null ? String(form.years_experience) : '',
    education: form.education ?? '',
    source: 'other',
    attributes: form.attributes,
    experiences: form.experiences.map((experience) => ({
      company: experience.company,
      title: experience.title,
      start_date: experience.start_date ?? '',
      end_date: experience.end_date ?? '',
      is_current: experience.is_current,
      description: experience.description ?? '',
    })),
    tags: form.tags,
  };
}

/**
 * Two ways in: drop a CV and let the parser fill the form, or type it manually.
 * The parsed result is always shown for review first — nothing is saved behind the
 * recruiter's back, and fields the CV did not contain are listed explicitly.
 */
export function NewCandidateFlow({ onDone }: { onDone?: () => void } = {}) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<'cv' | 'sheet' | 'manual'>('cv');
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ParsedCvResponse | null>(null);
  const [prefill, setPrefill] = useState<Partial<CandidateFormValues> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [bulk, setBulk] = useState<BulkResponse | null>(null);
  const [bulkCount, setBulkCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * One file opens the review screen; several go straight in as records.
   *
   * Reviewing forty CVs one at a time is not a workflow anybody uses — the batch is
   * imported and the result table says exactly what happened to each file, so anything
   * that needs a correction can be opened from there.
   */
  async function handleFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    if (files.length === 1) return handleFile(files[0]!);

    setUploading(true);
    setError(null);
    setResult(null);
    setBulk(null);
    setBulkCount(files.length);
    try {
      const formData = new FormData();
      for (const file of files) formData.append('files', file);
      const response = await api.upload<BulkResponse>('/api/cv/bulk', formData);
      setBulk(response);
      if (response.summary.created > 0) {
        toast.success(`נוספו ${response.summary.created} מועמדים`);
        router.refresh();
      } else {
        toast.info('לא נוסף אף מועמד — ראה פירוט');
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setUploading(false);
    }
  }

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    setResult(null);
    setFileName(file.name);
    setPendingFile(file);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await api.upload<ParsedCvResponse>('/api/cv/parse', formData);
      setResult(response);
      if (response.form) {
        setPrefill(toFormValues(response.form));
        toast.success('קורות החיים נקראו — בדוק את הפרטים ואשר');
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setUploading(false);
    }
  }

  /** After the record exists, the original file is attached to it. */
  async function attachFile(candidateId: string) {
    if (!pendingFile) return;
    try {
      const formData = new FormData();
      formData.append('file', pendingFile);
      formData.append('autofill', 'false');
      await api.upload(`/api/candidates/${candidateId}/documents`, formData);
    } catch {
      toast.info('המועמד נשמר, אבל צירוף קובץ קורות החיים נכשל. אפשר להעלות שוב מהפרופיל.');
    }
  }

  return (
    <div className="space-y-4">
      <Tabs
        tabs={[
          { key: 'cv', label: 'מקורות חיים' },
          { key: 'sheet', label: 'מאקסל' },
          { key: 'manual', label: 'הזנה ידנית' },
        ]}
        active={tab}
        onChange={(key) => setTab(key as 'cv' | 'sheet' | 'manual')}
      />

      {tab === 'sheet' && <ImportSheetFlow onDone={onDone} />}

      {tab === 'cv' && !prefill && (
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
              if (event.dataTransfer.files?.length) void handleFiles(event.dataTransfer.files);
            }}
            className={cx(
              'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition',
              dragging ? 'border-brand bg-brand-soft' : 'border-line',
            )}
          >
            {uploading ? (
              <>
                <Spinner className="h-7 w-7 text-brand" />
                <p className="text-sm font-medium text-ink">
                  {bulkCount > 1 ? `קורא ${bulkCount} קבצים…` : `קורא את ${fileName}…`}
                </p>
                {bulkCount > 1 && (
                  <p className="text-xs text-faint">קריאה של קורות חיים לוקחת כמה שניות לקובץ</p>
                )}
              </>
            ) : (
              <>
                <Icon.Upload size={30} className="text-faint" />
                <div>
                  <p className="text-sm font-semibold text-ink">גרור לכאן קורות חיים</p>
                  <p className="mt-1 text-sm text-muted">
                    קובץ אחד או עד 40 יחד · PDF, DOCX, TXT או RTF — עד 10MB לקובץ
                  </p>
                </div>
                <Button variant="secondary" onClick={() => inputRef.current?.click()}>
                  בחירת קבצים
                </Button>
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  accept=".pdf,.docx,.txt,.rtf"
                  className="hidden"
                  onChange={(event) => {
                    if (event.target.files?.length) void handleFiles(event.target.files);
                  }}
                />
              </>
            )}
          </div>

          <ErrorNote>{error}</ErrorNote>

          {bulk && (
            <div className="mt-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="emerald">{bulk.summary.created} נוספו</Badge>
                {bulk.summary.duplicates > 0 && <Badge tone="sky">{bulk.summary.duplicates} כבר קיימים</Badge>}
                {bulk.summary.unreadable > 0 && <Badge tone="amber">{bulk.summary.unreadable} לא נקראו</Badge>}
                {bulk.summary.failed > 0 && <Badge tone="rose">{bulk.summary.failed} נכשלו</Badge>}
              </div>

              <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
                {bulk.results.map((row) => {
                  const meta = BULK_TONE[row.status];
                  return (
                    <li key={row.fileName} className="flex items-center gap-3 px-3 py-2.5">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-ink">
                          {row.name ?? row.fileName}
                        </span>
                        <span className="block truncate text-xs text-faint">
                          {[row.city, row.phone, row.reason].filter(Boolean).join(' · ') || row.fileName}
                        </span>
                      </span>
                      {row.candidateId && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            onDone?.();
                            router.push(`/candidates/${row.candidateId}`);
                          }}
                        >
                          פתיחה
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>

              <div className="mt-3 flex justify-end gap-2">
                <Button variant="secondary" onClick={() => { setBulk(null); setBulkCount(0); }}>
                  העלאה נוספת
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

              {bulk.summary.created > 0 && (
                <p className="mt-3 text-xs text-faint">
                  שדות שלא הופיעו בקבצים נשארו ריקים. שים לב במיוחד לעיר ולטווח הנסיעה — הם
                  משפיעים ישירות על ציון ההתאמה.
                </p>
              )}
            </div>
          )}

          {result && result.status !== 'parsed' && (
            <div className="mt-4 rounded-lg bg-warn/10 px-4 py-3 text-sm text-warn">
              <p className="font-medium">לא הצלחתי לקרוא את הקובץ</p>
              <p className="mt-0.5">{result.reason ?? 'סוג הקובץ אינו נתמך.'}</p>
              <Button variant="secondary" size="sm" className="mt-2" onClick={() => setTab('manual')}>
                להזנה ידנית
              </Button>
            </div>
          )}

          <p className="mt-4 text-center text-xs text-faint">
            הקריאה מתבצעת בשרת שלך. שדות שלא מופיעים בקובץ נשארים ריקים — המערכת לא ממציאה מידע.
          </p>
        </Card>
      )}

      {tab === 'cv' && prefill && result?.parsed && (
        <>
          <Card title="מה נקרא מקורות החיים">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={result.parsed.confidence >= 70 ? 'emerald' : 'amber'}>
                זוהו {result.parsed.confidence}% מהשדות
              </Badge>
              {result.parsed.licenses.map((license) => (
                <Badge key={license} tone="sky">{license}</Badge>
              ))}
              {result.parsed.certifications.slice(0, 4).map((certification) => (
                <Badge key={certification} tone="violet">{certification}</Badge>
              ))}
              <span className="text-xs text-faint">
                {result.parsed.experiences.length} מקומות עבודה זוהו
              </span>
            </div>
            {result.parsed.missing.length > 0 && (
              <p className="mt-3 rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn">
                לא נמצא בקובץ: {result.parsed.missing.join(', ')} — כדאי להשלים ידנית.
              </p>
            )}
            <button
              onClick={() => {
                setPrefill(null);
                setResult(null);
                setPendingFile(null);
              }}
              className="mt-3 text-sm font-medium text-brand"
            >
              העלאת קובץ אחר
            </button>
          </Card>

          <Card title="פרטי המועמד">
            <CandidateForm
              initial={prefill}
              onSaved={async (candidate) => {
                await attachFile(candidate.id);
                onDone?.();
                onDone?.();
              router.push(`/candidates/${candidate.id}`);
                router.refresh();
              }}
            />
          </Card>
        </>
      )}

      {tab === 'manual' && (
        <Card>
          <CandidateForm
            onSaved={(candidate) => {
              onDone?.();
              router.push(`/candidates/${candidate.id}`);
              router.refresh();
            }}
          />
        </Card>
      )}
    </div>
  );
}
