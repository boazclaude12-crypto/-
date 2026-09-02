import { repos } from '@/lib/db/repos';
import { storeUpload } from '@/lib/documents/storage';
import { extractText } from '@/lib/documents/extract';
import { getAiProvider } from '@/lib/ai/index';
import { updateCandidate } from '@/lib/domain/candidates';
import { emitEvent, EVENT_TYPES } from '@/lib/domain/events';
import { ApiError, json, notFound, withAuth } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Uploads a CV for an existing candidate, extracts its text, parses it, and fills in
 * only the fields the candidate record is still missing — never overwriting what the
 * recruiter already typed.
 */
export const POST = withAuth<{ id: string }>(async (request, { auth, params }) => {
  const candidate = repos.candidates.find(auth.org.id, params.id);
  if (!candidate) throw notFound('מועמד לא נמצא');

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw new ApiError(400, 'לא נשלח קובץ');
  const autofill = form.get('autofill') !== 'false';

  const stored = await storeUpload(auth.org.id, file);
  const extracted = extractText(stored.buffer, stored.mimeType, stored.fileName);

  const document = repos.candidateDocuments.create(auth.org.id, {
    candidate_id: candidate.id,
    kind: 'cv',
    file_name: stored.fileName,
    stored_name: stored.storedName,
    mime_type: stored.mimeType,
    size_bytes: stored.size,
    text_content: extracted.text || null,
    parse_status: extracted.status,
  });

  let applied: string[] = [];
  let parsed = null;

  if (extracted.status === 'parsed' && extracted.text) {
    parsed = await getAiProvider().parseCv(extracted.text);

    if (autofill) {
      const patch: Record<string, unknown> = {};
      if (!candidate.phone && parsed.phone) patch.phone = parsed.phone;
      if (!candidate.email && parsed.email) patch.email = parsed.email;
      if (!candidate.city && parsed.city) patch.city = parsed.city;
      if (!candidate.current_role && parsed.current_role) patch.current_role = parsed.current_role;
      if (!candidate.years_experience && parsed.years_experience) patch.years_experience = parsed.years_experience;
      if (!candidate.education && parsed.education) patch.education = parsed.education;

      const existingAttributes = repos.candidateAttributes.list(auth.org.id, {
        where: 'candidate_id = ?', params: [candidate.id],
      });
      const parsedAttributes = [
        ...parsed.licenses.map((value) => ({ kind: 'license' as const, value })),
        ...parsed.certifications.map((value) => ({ kind: 'certification' as const, value })),
        ...parsed.skills.map((value) => ({ kind: 'skill' as const, value })),
        ...parsed.languages.map((value) => ({ kind: 'language' as const, value })),
      ];
      if (parsedAttributes.length) {
        const merged = [
          ...existingAttributes.map((a) => ({ kind: a.kind as 'license', value: a.value })),
          ...parsedAttributes.filter(
            (candidateAttribute) =>
              !existingAttributes.some((existing) => existing.value === candidateAttribute.value),
          ),
        ];
        patch.attributes = merged;
      }

      const existingExperiences = repos.candidateExperiences.list(auth.org.id, {
        where: 'candidate_id = ?', params: [candidate.id],
      });
      if (existingExperiences.length === 0 && parsed.experiences.length) {
        patch.experiences = parsed.experiences.map((experience) => ({
          company: experience.company || '—',
          title: experience.title,
          start_date: experience.start_date,
          end_date: experience.end_date,
          is_current: experience.is_current,
          description: experience.description,
        }));
      }

      applied = Object.keys(patch);
      if (applied.length) {
        updateCandidate(auth.org.id, auth.user.id, candidate.id, patch as never);
      }
    }
  }

  emitEvent(auth.org.id, {
    type: EVENT_TYPES.cvUploaded,
    candidateId: candidate.id,
    actorUserId: auth.user.id,
    summary: `הועלו קורות חיים: ${stored.fileName}`,
    meta: { parse_status: extracted.status, applied },
  });

  return json(
    {
      document: { ...document, text_content: undefined },
      parse: { status: extracted.status, reason: extracted.reason ?? null },
      parsed,
      applied,
    },
    { status: 201 },
  );
});
