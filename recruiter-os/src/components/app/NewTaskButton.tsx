'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '../ui';
import { Modal } from '../ui/Modal';
import { Icon } from '../ui/icons';
import { TaskForm } from '../forms/TaskForm';

export function NewTaskButton({ label = 'משימה חדשה' }: { label?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button icon={<Icon.Plus size={16} />} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="משימה חדשה">
        <TaskForm
          onSaved={() => {
            setOpen(false);
            router.refresh();
          }}
          onCancel={() => setOpen(false)}
        />
      </Modal>
    </>
  );
}
