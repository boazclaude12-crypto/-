'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge, Button, EmptyState, Select, Table, Tabs, Td, Th } from '../ui';
import { Icon } from '../ui/icons';
import { useToast } from '../ui/Toast';
import { api, errorMessage } from '@/lib/client/api';
import { formatDate, formatMoney } from '@/lib/format';
import { colorOf, labelOf, PAYMENT_STATUSES, PLACEMENT_STATUSES } from '@/lib/domain/constants';

export interface PlacementView {
  id: string;
  candidate_id: string;
  candidate_name: string;
  job_id: string;
  job_title: string;
  client_id: string;
  client_name: string;
  start_date: string;
  salary: number | null;
  fee_amount: number;
  status: string;
  guarantee_until: string | null;
  paid_amount: number;
  pending_amount: number;
}

export interface PaymentView {
  id: string;
  client_id: string;
  client_name: string;
  candidate_name: string | null;
  job_title: string | null;
  amount: number;
  status: string;
  due_date: string | null;
  invoice_number: string | null;
  is_overdue: number;
}

/** Placement and payment tables where the status controls are the actual write path. */
export function MoneyTables({
  placements,
  payments,
}: {
  placements: PlacementView[];
  payments: PaymentView[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<'placements' | 'payments'>('placements');
  const [busyId, setBusyId] = useState<string | null>(null);

  async function updatePayment(paymentId: string, status: string) {
    setBusyId(paymentId);
    try {
      await api.patch(`/api/payments/${paymentId}`, { status });
      toast.success(status === 'paid' ? 'התשלום סומן כהתקבל' : 'סטטוס התשלום עודכן');
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusyId(null);
    }
  }

  async function markStarted(placementId: string) {
    setBusyId(placementId);
    try {
      await api.post(`/api/placements/${placementId}/start`);
      toast.success('סומן שהמועמד התחיל לעבוד');
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusyId(null);
    }
  }

  async function updatePlacement(placementId: string, status: string) {
    setBusyId(placementId);
    try {
      await api.patch(`/api/placements/${placementId}`, { status });
      toast.success('סטטוס ההשמה עודכן');
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="px-4 pt-2">
        <Tabs
          tabs={[
            { key: 'placements', label: 'השמות', count: placements.length },
            { key: 'payments', label: 'תשלומים', count: payments.length },
          ]}
          active={tab}
          onChange={(key) => setTab(key as 'placements' | 'payments')}
        />
      </div>

      {tab === 'placements' &&
        (placements.length === 0 ? (
          <EmptyState
            icon={<Icon.Money size={28} />}
            title="אין עדיין השמות"
            description="כשמועמד מתקבל, רשום השמה מדף המשרה — המערכת תחשב את העמלה ותפתח תשלום צפוי."
          />
        ) : (
          <Table>
            <thead className="hairline">
              <tr>
                <Th>מועמד</Th>
                <Th className="hidden md:table-cell">משרה</Th>
                <Th className="hidden sm:table-cell">לקוח</Th>
                <Th>התחלה</Th>
                <Th>עמלה</Th>
                <Th>סטטוס</Th>
                <Th />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {placements.map((placement) => (
                <tr key={placement.id}>
                  <Td>
                    <Link
                      href={`/candidates/${placement.candidate_id}`}
                      className="font-medium text-ink hover:text-brand"
                    >
                      {placement.candidate_name}
                    </Link>
                  </Td>
                  <Td className="hidden md:table-cell">
                    <Link href={`/jobs/${placement.job_id}`} className="text-sm text-muted hover:text-brand">
                      {placement.job_title}
                    </Link>
                  </Td>
                  <Td className="hidden sm:table-cell">
                    <Link href={`/clients/${placement.client_id}`} className="text-sm text-muted hover:text-brand">
                      {placement.client_name}
                    </Link>
                  </Td>
                  <Td>
                    <span className="num text-sm">{formatDate(placement.start_date)}</span>
                  </Td>
                  <Td>
                    <span className="num text-sm font-medium text-ink">{formatMoney(placement.fee_amount)}</span>
                    {placement.paid_amount > 0 && (
                      <span className="num block text-xs text-ok">{formatMoney(placement.paid_amount)} שולם</span>
                    )}
                  </Td>
                  <Td>
                    <Select
                      className="h-8 w-auto min-w-[8rem] text-xs"
                      options={PLACEMENT_STATUSES}
                      value={placement.status}
                      disabled={busyId === placement.id}
                      onChange={(event) => updatePlacement(placement.id, event.target.value)}
                      aria-label="סטטוס השמה"
                    />
                  </Td>
                  <Td>
                    {placement.status === 'active' && (
                      <Button
                        size="sm"
                        variant="subtle"
                        loading={busyId === placement.id}
                        onClick={() => markStarted(placement.id)}
                      >
                        התחיל לעבוד
                      </Button>
                    )}
                    {placement.status === 'guarantee' && placement.guarantee_until && (
                      <span className="num text-xs text-faint">
                        אחריות עד {formatDate(placement.guarantee_until)}
                      </span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ))}

      {tab === 'payments' &&
        (payments.length === 0 ? (
          <EmptyState
            icon={<Icon.Money size={28} />}
            title="אין תשלומים"
            description="תשלום צפוי נוצר אוטומטית עם כל השמה, לפי תנאי התשלום של הלקוח."
          />
        ) : (
          <Table>
            <thead className="hairline">
              <tr>
                <Th>לקוח</Th>
                <Th className="hidden md:table-cell">עבור</Th>
                <Th>סכום</Th>
                <Th>תאריך יעד</Th>
                <Th>סטטוס</Th>
                <Th />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {payments.map((payment) => (
                <tr key={payment.id} className={payment.is_overdue ? 'bg-danger/5' : undefined}>
                  <Td>
                    <Link href={`/clients/${payment.client_id}`} className="font-medium text-ink hover:text-brand">
                      {payment.client_name}
                    </Link>
                    {payment.invoice_number && (
                      <span className="num block text-xs text-faint">חשבונית {payment.invoice_number}</span>
                    )}
                  </Td>
                  <Td className="hidden md:table-cell">
                    <span className="text-sm text-muted">
                      {[payment.candidate_name, payment.job_title].filter(Boolean).join(' · ') || '—'}
                    </span>
                  </Td>
                  <Td>
                    <span className="num text-sm font-medium text-ink">{formatMoney(payment.amount)}</span>
                  </Td>
                  <Td>
                    <span className={`num text-sm ${payment.is_overdue ? 'font-medium text-danger' : 'text-muted'}`}>
                      {payment.due_date ? formatDate(payment.due_date) : '—'}
                    </span>
                  </Td>
                  <Td>
                    <Badge tone={colorOf(PAYMENT_STATUSES, payment.status)}>
                      {labelOf(PAYMENT_STATUSES, payment.status)}
                    </Badge>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      {payment.status !== 'paid' && (
                        <Button
                          size="sm"
                          variant="subtle"
                          loading={busyId === payment.id}
                          onClick={() => updatePayment(payment.id, 'paid')}
                        >
                          התקבל
                        </Button>
                      )}
                      <Select
                        className="h-8 w-auto min-w-[7.5rem] text-xs"
                        options={PAYMENT_STATUSES}
                        value={payment.status}
                        disabled={busyId === payment.id}
                        onChange={(event) => updatePayment(payment.id, event.target.value)}
                        aria-label="סטטוס תשלום"
                      />
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ))}
    </div>
  );
}
