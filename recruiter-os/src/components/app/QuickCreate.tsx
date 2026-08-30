'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '../ui/Modal';
import { JobForm } from '../forms/JobForm';
import { NewCandidateFlow } from './NewCandidateFlow';
import { ClientForm } from '../forms/ClientForm';
import { TaskForm } from '../forms/TaskForm';

export type QuickCreateKind = 'candidate' | 'job' | 'client' | 'task';

const TITLES: Record<QuickCreateKind, { title: string; description: string }> = {
  candidate: { title: 'מועמד חדש', description: 'גרור קורות חיים והמערכת תמלא את הפרטים — או הזן ידנית.' },
  job: { title: 'משרה חדשה', description: 'הוסף דרישות מובנות כדי שההתאמה האוטומטית תעבוד.' },
  client: { title: 'לקוח חדש', description: 'הגדרת עמלה ברירת מחדל תחסוך הזנה בכל השמה.' },
  task: { title: 'משימה חדשה', description: 'כל משימה יכולה להיות מקושרת למועמד, משרה או לקוח.' },
};

/** One dialog that hosts every create form, so "+ חדש" always works from anywhere. */
export function QuickCreate({ kind, onClose }: { kind: QuickCreateKind | null; onClose: () => void }) {
  const router = useRouter();
  if (!kind) return null;

  const meta = TITLES[kind];

  function done(href?: string) {
    onClose();
    if (href) router.push(href);
    router.refresh();
  }

  return (
    <Modal open onClose={onClose} title={meta.title} description={meta.description} size={kind === 'task' ? 'md' : 'lg'}>
      {kind === 'candidate' && <NewCandidateFlow onDone={onClose} />}
      {kind === 'job' && <JobForm onSaved={(job) => done(`/jobs/${job.id}`)} onCancel={onClose} />}
      {kind === 'client' && <ClientForm onSaved={(client) => done(`/clients/${client.id}`)} onCancel={onClose} />}
      {kind === 'task' && <TaskForm onSaved={() => done()} onCancel={onClose} />}
    </Modal>
  );
}
