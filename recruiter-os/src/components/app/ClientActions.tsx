'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '../ui';
import { Modal, ConfirmDialog } from '../ui/Modal';
import { Icon } from '../ui/icons';
import { useToast } from '../ui/Toast';
import { ClientForm, type ClientFormValues } from '../forms/ClientForm';
import { TaskForm } from '../forms/TaskForm';
import { api, errorMessage } from '@/lib/client/api';

type DialogKind = 'edit' | 'task' | 'delete' | null;

export function ClientActions({
  clientId,
  clientName,
  formValues,
}: {
  clientId: string;
  clientName: string;
  formValues: Partial<ClientFormValues>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [dialog, setDialog] = useState<DialogKind>(null);

  async function remove() {
    try {
      await api.del(`/api/clients/${clientId}`);
      toast.success('הלקוח נמחק');
      router.push('/clients');
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" icon={<Icon.Plus size={16} />} onClick={() => router.push('/jobs/new')}>
          משרה חדשה
        </Button>
        <Button variant="secondary" icon={<Icon.CheckSquare size={16} />} onClick={() => setDialog('task')}>
          משימה
        </Button>
        <Button variant="secondary" icon={<Icon.Edit size={16} />} onClick={() => setDialog('edit')}>
          עריכה
        </Button>
        <Button variant="ghost" icon={<Icon.Trash size={16} />} onClick={() => setDialog('delete')}>
          מחיקה
        </Button>
      </div>

      <Modal open={dialog === 'edit'} onClose={() => setDialog(null)} title="עריכת לקוח" size="lg">
        <ClientForm
          clientId={clientId}
          initial={formValues}
          onSaved={() => {
            setDialog(null);
            router.refresh();
          }}
          onCancel={() => setDialog(null)}
        />
      </Modal>

      <Modal open={dialog === 'task'} onClose={() => setDialog(null)} title="משימה חדשה">
        <TaskForm
          lockedContext={{ clientId, label: clientName }}
          onSaved={() => {
            setDialog(null);
            router.refresh();
          }}
          onCancel={() => setDialog(null)}
        />
      </Modal>

      <ConfirmDialog
        open={dialog === 'delete'}
        title="מחיקת לקוח"
        message={`למחוק את ${clientName}? המשרות, ההשמות והתשלומים המקושרים יימחקו גם הם.`}
        confirmLabel="מחיקה"
        onConfirm={remove}
        onClose={() => setDialog(null)}
      />
    </>
  );
}
