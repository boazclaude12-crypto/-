'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { JobForm } from '../forms/JobForm';
import { ClientForm } from '../forms/ClientForm';

/** Thin client wrappers so the "new" pages can stay server components. */

export function NewJobForm() {
  const router = useRouter();
  return (
    <JobForm
      onSaved={(job) => {
        router.push(`/jobs/${job.id}`);
        router.refresh();
      }}
    />
  );
}

export function NewClientForm() {
  const router = useRouter();
  return (
    <ClientForm
      onSaved={(client) => {
        router.push(`/clients/${client.id}`);
        router.refresh();
      }}
    />
  );
}
