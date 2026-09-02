'use client';

import React, { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Spinner } from '../ui';
import { Icon } from '../ui/icons';
import { useToast } from '../ui/Toast';
import { api, errorMessage } from '@/lib/client/api';
import { formatDate } from '@/lib/format';

export interface CandidateDocument {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  parse_status: string;
  created_at: string;
}

const PARSE_LABEL: Record<string, { label: string; tone: string }> = {
  parsed: { label: 'נקרא', tone: 'emerald' },
  pending: { label: 'ממתין', tone: 'slate' },
  unsupported: { label: 'לא נתמך', tone: 'amber' },
  failed: { label: 'קריאה נכשלה', tone: 'rose' },
};

/** Upload fills empty candidate fields from the CV; existing values are left untouched. */
export function DocumentPanel({
  candidateId,
  documents,
}: {
  candidateId: string;
  documents: CandidateDocument[];
}) {
  const router = useRouter();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const result = await api.upload<{
        parse: { status: string; reason: string | null };
        applied: string[];
      }>(`/api/candidates/${candidateId}/documents`, formData);

      if (result.parse.status === 'parsed') {
        toast.success(
          result.applied.length
            ? `קורות החיים נקראו — הושלמו ${result.applied.length} שדות חסרים`
            : 'קורות החיים נקראו ונשמרו',
        );
      } else {
        toast.info(result.parse.reason ?? 'הקובץ נשמר אך לא ניתן היה לקרוא ממנו טקסט');
      }
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function remove(documentId: string) {
    try {
      await api.del(`/api/documents/${documentId}`);
      toast.success('המסמך נמחק');
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <div className="space-y-3">
      {documents.length === 0 ? (
        <p className="text-sm text-muted">עדיין אין מסמכים.</p>
      ) : (
        <ul className="space-y-2">
          {documents.map((document) => {
            const parse = PARSE_LABEL[document.parse_status] ?? PARSE_LABEL.pending!;
            return (
              <li key={document.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2">
                <Icon.Doc size={18} className="shrink-0 text-faint" />
                <span className="min-w-0 flex-1">
                  <a
                    href={`/api/documents/${document.id}`}
                    className="block truncate text-sm font-medium text-ink hover:text-brand"
                  >
                    {document.file_name}
                  </a>
                  <span className="block text-xs text-faint">
                    {Math.max(1, Math.round(document.size_bytes / 1024))}KB · {formatDate(document.created_at)}
                  </span>
                </span>
                <Badge tone={parse.tone}>{parse.label}</Badge>
                <button
                  onClick={() => remove(document.id)}
                  className="rounded-md p-1.5 text-muted transition hover:bg-danger/10 hover:text-danger"
                  aria-label="מחיקת מסמך"
                >
                  <Icon.Trash size={15} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Button
        variant="secondary"
        size="sm"
        loading={uploading}
        icon={<Icon.Upload size={15} />}
        onClick={() => inputRef.current?.click()}
      >
        העלאת קורות חיים
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.txt,.rtf"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      {uploading && (
        <p className="flex items-center gap-2 text-xs text-muted">
          <Spinner className="h-3 w-3" /> קורא את הקובץ ומשלים פרטים חסרים…
        </p>
      )}
    </div>
  );
}

/** Free-text note that lands on the entity's timeline. */
export function NoteComposer({
  candidateId,
  clientId,
  jobId,
}: {
  candidateId?: string;
  clientId?: string;
  jobId?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!body.trim()) return;
    setSaving(true);
    try {
      await api.post('/api/notes', {
        body: body.trim(),
        candidate_id: candidateId ?? null,
        client_id: clientId ?? null,
        job_id: jobId ?? null,
      });
      setBody('');
      toast.success('ההערה נשמרה');
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex gap-2">
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder="הוספת הערה לציר הזמן…"
        rows={2}
        className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
      />
      <Button onClick={save} loading={saving} disabled={!body.trim()}>
        שמירה
      </Button>
    </div>
  );
}
