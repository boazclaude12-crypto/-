'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, EmptyState, Select, cx } from '../ui';
import { Icon } from '../ui/icons';
import { useToast } from '../ui/Toast';
import { MatchExplanation, type CommuteView, type RequirementCheckView } from './MatchExplanation';
import { api, errorMessage } from '@/lib/client/api';
import { AVAILABILITY, labelOf } from '@/lib/domain/constants';
import { whatsappHref } from '@/lib/format';
import { formatMoney } from '@/lib/format';

export interface CandidateMatchView {
  candidateId: string;
  score: number;
  reasons: string[];
  gaps: string[];
  requirements: RequirementCheckView[];
  distanceKm: number | null;
  commute: CommuteView | null;
  breakdown: Array<{ label: string; earned: number; max: number }>;
  candidate: {
    id: string;
    name: string;
    city: string | null;
    current_role: string | null;
    desired_salary: number | null;
    availability: string | null;
    phone: string | null;
  };
  alreadyOnJob: boolean;
}

const THRESHOLDS = [
  { value: '0', label: 'כל המועמדים' },
  { value: '50', label: 'מעל 50%' },
  { value: '65', label: 'מעל 65%' },
  { value: '80', label: 'מעל 80%' },
  { value: '90', label: 'מעל 90%' },
];

/** Ranked shortlist with one-click "add to pipeline" per candidate. */
export function MatchList({
  jobId,
  matches,
  initialMinScore = 0,
}: {
  jobId: string;
  matches: CandidateMatchView[];
  initialMinScore?: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [minScore, setMinScore] = useState(String(initialMinScore));
  const [hideExisting, setHideExisting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [messagingId, setMessagingId] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());

  const visible = matches.filter(
    (match) =>
      match.score >= Number(minScore) && (!hideExisting || (!match.alreadyOnJob && !added.has(match.candidateId))),
  );

  async function addToPipeline(match: CandidateMatchView) {
    setBusyId(match.candidateId);
    try {
      await api.post('/api/applications', {
        candidate_id: match.candidateId,
        job_id: jobId,
        match_score: match.score,
      });
      setAdded((current) => new Set(current).add(match.candidateId));
      toast.success(`${match.candidate.name} נוסף לפייפליין`);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusyId(null);
    }
  }

  /**
   * Writes the approach message for this candidate and this job, files it in their
   * history, and hands it to WhatsApp ready to send.
   *
   * From the shortlist, because that is where the decision to contact someone is made.
   * Sending used to mean opening the profile, finding the message screen and choosing
   * the job again — three screens between deciding and doing, on the one action the
   * whole product exists to make faster.
   */
  async function messageOnWhatsApp(match: CandidateMatchView) {
    const phone = match.candidate.phone;
    if (!phone) {
      toast.error('אין מספר טלפון למועמד הזה');
      return;
    }
    setMessagingId(match.candidateId);
    // Opened synchronously: a popup blocked because it followed an await is the most
    // common way this kind of button silently does nothing.
    const tab = window.open('', '_blank');
    try {
      const generated = await api.post<{ body: string }>('/api/messages/generate', {
        candidate_id: match.candidateId,
        job_id: jobId,
        channel: 'whatsapp',
        tone: 'short',
      });
      const href = whatsappHref(phone, generated.body);
      if (tab && href) tab.location.href = href;
      else tab?.close();

      // Recorded against the candidate and the job, so the pipeline shows who has been
      // approached about what. A message sent and forgotten is how a candidate ends up
      // contacted twice about the same opening — or never followed up at all.
      await api.post('/api/messages', {
        channel: 'whatsapp',
        candidate_id: match.candidateId,
        job_id: jobId,
        body: generated.body,
      });
      toast.success(`ההודעה ל${match.candidate.name} נשמרה בהיסטוריה`);
      router.refresh();
    } catch (caught) {
      tab?.close();
      toast.error(errorMessage(caught));
    } finally {
      setMessagingId(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <Select
          className="w-auto"
          options={THRESHOLDS}
          value={minScore}
          onChange={(event) => setMinScore(event.target.value)}
          aria-label="סף התאמה"
        />
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={hideExisting}
            onChange={(event) => setHideExisting(event.target.checked)}
            className="h-4 w-4 rounded border-line text-brand focus:ring-brand/30"
          />
          הסתר מועמדים שכבר בתהליך
        </label>
        <span className="num mr-auto text-sm text-faint">{visible.length} מועמדים</span>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<Icon.Target size={28} />}
          title="אין מועמדים שעוברים את הסף"
          description="אפשר להוריד את סף ההתאמה, להוסיף מועמדים למאגר, או לרכך את דרישות החובה של המשרה."
        />
      ) : (
        <ul className="divide-y divide-line">
          {visible.map((match) => {
            const isAdded = match.alreadyOnJob || added.has(match.candidateId);
            return (
              <li key={match.candidateId} className="px-4 py-3">
                <MatchExplanation
                  score={match.score}
                  title={match.candidate.name}
                  subtitle={[
                    match.candidate.current_role,
                    match.candidate.city,
                    match.candidate.desired_salary ? `מבקש ${formatMoney(match.candidate.desired_salary)}` : null,
                    labelOf(AVAILABILITY, match.candidate.availability, ''),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  href={`/candidates/${match.candidateId}`}
                  reasons={match.reasons}
                  gaps={match.gaps}
                  requirements={match.requirements}
                  distanceKm={match.distanceKm}
                  commute={match.commute}
                  breakdown={match.breakdown}
                  action={
                    <div className="flex shrink-0 items-center gap-1.5">
                      {match.candidate.phone && (
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={messagingId === match.candidateId}
                          onClick={() => messageOnWhatsApp(match)}
                          icon={<Icon.Chat size={14} />}
                        >
                          וואטסאפ
                        </Button>
                      )}
                      {isAdded ? (
                        <Badge tone="emerald">
                          <Icon.Check size={12} /> בפייפליין
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          loading={busyId === match.candidateId}
                          onClick={() => addToPipeline(match)}
                          className={cx('shrink-0')}
                        >
                          הוספה לפייפליין
                        </Button>
                      )}
                    </div>
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
