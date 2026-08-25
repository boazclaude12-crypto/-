import { getDb } from '../db/index';
import { repos } from '../db/repos';
import { emitEvent, EVENT_TYPES } from './events';
import type { z } from 'zod';
import type { noteSchema } from '../schemas';
import type { NoteRow } from '../types';

type NoteInput = z.infer<typeof noteSchema>;

export function createNote(orgId: string, userId: string, input: NoteInput): NoteRow {
  const note = repos.notes.create(orgId, {
    body: input.body,
    candidate_id: input.candidate_id ?? null,
    client_id: input.client_id ?? null,
    job_id: input.job_id ?? null,
    application_id: input.application_id ?? null,
    author_user_id: userId,
  });

  emitEvent(orgId, {
    type: EVENT_TYPES.noteAdded,
    candidateId: note.candidate_id,
    clientId: note.client_id,
    jobId: note.job_id,
    applicationId: note.application_id,
    actorUserId: userId,
    summary: note.body.length > 90 ? `${note.body.slice(0, 90)}…` : note.body,
  });
  return note;
}

export function listNotes(
  orgId: string,
  filters: { candidateId?: string; clientId?: string; jobId?: string; limit?: number } = {},
): NoteRow[] {
  const clauses: string[] = [];
  const params: string[] = [];
  if (filters.candidateId) {
    clauses.push('candidate_id = ?');
    params.push(filters.candidateId);
  }
  if (filters.clientId) {
    clauses.push('client_id = ?');
    params.push(filters.clientId);
  }
  if (filters.jobId) {
    clauses.push('job_id = ?');
    params.push(filters.jobId);
  }
  return getDb().all<NoteRow>(
    `SELECT * FROM notes WHERE org_id = ? ${clauses.length ? `AND ${clauses.join(' AND ')}` : ''}
      ORDER BY created_at DESC LIMIT ?`,
    orgId, ...params, filters.limit ?? 50,
  );
}

export function deleteNote(orgId: string, noteId: string): boolean {
  return repos.notes.remove(orgId, noteId);
}
