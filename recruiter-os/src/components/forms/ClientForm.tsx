'use client';

import React, { useState } from 'react';
import { Button, Checkbox, ErrorNote, Field, Input, Select, Textarea } from '../ui';
import { Icon } from '../ui/icons';
import { api, errorMessage } from '@/lib/client/api';
import { useToast } from '../ui/Toast';
import { CLIENT_STATUSES } from '@/lib/domain/constants';

export interface ClientFormValues {
  name: string;
  industry: string;
  city: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  status: string;
  fee_type: string;
  fee_value: string;
  payment_terms_days: string;
  notes: string;
  contacts: Array<{ name: string; role: string; phone: string; email: string; is_primary: boolean }>;
}

export const EMPTY_CLIENT: ClientFormValues = {
  name: '', industry: '', city: '', address: '', phone: '', email: '', website: '',
  status: 'active', fee_type: 'percent', fee_value: '12', payment_terms_days: '30', notes: '',
  contacts: [],
};

export function ClientForm({
  initial,
  clientId,
  onSaved,
  onCancel,
}: {
  initial?: Partial<ClientFormValues>;
  clientId?: string;
  onSaved: (client: { id: string }) => void;
  onCancel?: () => void;
}) {
  const toast = useToast();
  const [values, setValues] = useState<ClientFormValues>({ ...EMPTY_CLIENT, ...initial });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof ClientFormValues>(key: K, value: ClientFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (values.name.trim().length < 2) {
      setError('יש להזין שם חברה');
      return;
    }
    setSaving(true);
    setError(null);
    const number = (value: string) => (value.trim() === '' ? null : Number(value));
    try {
      const payload = {
        name: values.name.trim(),
        industry: values.industry.trim() || null,
        city: values.city.trim() || null,
        address: values.address.trim() || null,
        phone: values.phone.trim() || null,
        email: values.email.trim() || null,
        website: values.website.trim() || null,
        status: values.status,
        fee_type: values.fee_type,
        fee_value: number(values.fee_value),
        payment_terms_days: number(values.payment_terms_days),
        notes: values.notes.trim() || null,
        contacts: values.contacts.filter((contact) => contact.name.trim()),
      };
      const result = clientId
        ? await api.patch<{ client: { id: string } }>(`/api/clients/${clientId}`, payload)
        : await api.post<{ client: { id: string } }>('/api/clients', payload);
      toast.success(clientId ? 'הלקוח עודכן' : 'הלקוח נוסף');
      onSaved(result.client);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <ErrorNote>{error}</ErrorNote>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="שם החברה" required>
          <Input value={values.name} onChange={(event) => set('name', event.target.value)} autoFocus />
        </Field>
        <Field label="תחום">
          <Input
            value={values.industry}
            onChange={(event) => set('industry', event.target.value)}
            placeholder="לוגיסטיקה"
          />
        </Field>
        <Field label="עיר">
          <Input value={values.city} onChange={(event) => set('city', event.target.value)} />
        </Field>
        <Field label="כתובת">
          <Input value={values.address} onChange={(event) => set('address', event.target.value)} />
        </Field>
        <Field label="טלפון">
          <Input value={values.phone} onChange={(event) => set('phone', event.target.value)} inputMode="tel" />
        </Field>
        <Field label="אימייל">
          <Input value={values.email} onChange={(event) => set('email', event.target.value)} inputMode="email" />
        </Field>
        <Field label="סטטוס">
          <Select
            options={CLIENT_STATUSES}
            value={values.status}
            onChange={(event) => set('status', event.target.value)}
          />
        </Field>
        <Field label="אתר">
          <Input value={values.website} onChange={(event) => set('website', event.target.value)} />
        </Field>
        <Field label="סוג עמלה">
          <Select
            options={[
              { value: 'percent', label: 'אחוז משכר' },
              { value: 'fixed', label: 'סכום קבוע' },
            ]}
            value={values.fee_type}
            onChange={(event) => set('fee_type', event.target.value)}
          />
        </Field>
        <Field
          label={values.fee_type === 'percent' ? 'עמלה ברירת מחדל (%)' : 'עמלה ברירת מחדל (₪)'}
          hint="משמש כברירת מחדל למשרות ולהשמות של הלקוח"
        >
          <Input
            type="number"
            value={values.fee_value}
            onChange={(event) => set('fee_value', event.target.value)}
          />
        </Field>
        <Field label="שוטף + (ימים)">
          <Input
            type="number"
            value={values.payment_terms_days}
            onChange={(event) => set('payment_terms_days', event.target.value)}
          />
        </Field>
      </div>

      <div>
        <span className="field-label">אנשי קשר</span>
        <div className="space-y-2">
          {values.contacts.map((contact, index) => (
            <div key={index} className="rounded-lg border border-line p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  placeholder="שם"
                  value={contact.name}
                  onChange={(event) => {
                    const next = [...values.contacts];
                    next[index] = { ...contact, name: event.target.value };
                    set('contacts', next);
                  }}
                />
                <Input
                  placeholder="תפקיד"
                  value={contact.role}
                  onChange={(event) => {
                    const next = [...values.contacts];
                    next[index] = { ...contact, role: event.target.value };
                    set('contacts', next);
                  }}
                />
                <Input
                  placeholder="טלפון"
                  value={contact.phone}
                  onChange={(event) => {
                    const next = [...values.contacts];
                    next[index] = { ...contact, phone: event.target.value };
                    set('contacts', next);
                  }}
                />
                <Input
                  placeholder="אימייל"
                  value={contact.email}
                  onChange={(event) => {
                    const next = [...values.contacts];
                    next[index] = { ...contact, email: event.target.value };
                    set('contacts', next);
                  }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <Checkbox
                  label="איש קשר ראשי"
                  checked={contact.is_primary}
                  onChange={(event) => {
                    const next = values.contacts.map((item, i) => ({
                      ...item,
                      is_primary: i === index ? event.target.checked : false,
                    }));
                    set('contacts', next);
                  }}
                />
                <button
                  type="button"
                  onClick={() => set('contacts', values.contacts.filter((_, i) => i !== index))}
                  className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger"
                  aria-label="הסרה"
                >
                  <Icon.Trash size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() =>
            set('contacts', [
              ...values.contacts,
              { name: '', role: '', phone: '', email: '', is_primary: values.contacts.length === 0 },
            ])
          }
          className="mt-2 flex items-center gap-1 text-sm font-medium text-brand"
        >
          <Icon.Plus size={14} /> הוספת איש קשר
        </button>
      </div>

      <Field label="הערות">
        <Textarea value={values.notes} onChange={(event) => set('notes', event.target.value)} rows={3} />
      </Field>

      <div className="flex justify-end gap-2 border-t border-line pt-4">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            ביטול
          </Button>
        )}
        <Button type="submit" loading={saving}>
          {clientId ? 'שמירת שינויים' : 'הוספת לקוח'}
        </Button>
      </div>
    </form>
  );
}
