'use client';

import React, { useState } from 'react';
import { Card, Table, Td, Th } from '../ui';
import { Funnel, GroupedBarChart, RankedBars } from '../charts';
import type { AnalyticsData } from '@/lib/domain/analytics';
import { formatMoney } from '@/lib/format';

const MONTH_LABELS = [
  'ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יונ', 'יול', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ',
];

function monthLabel(value: string): string {
  const [, month] = value.split('-');
  return MONTH_LABELS[Number(month) - 1] ?? value;
}

/**
 * The chart block. The revenue chart carries a table view as well — the amber
 * series sits below 3:1 against the light surface, so the numbers must also be
 * readable without relying on the fill colour.
 */
export function AnalyticsCharts({ data }: { data: AnalyticsData }) {
  const [showTable, setShowTable] = useState(false);

  const revenueRows = data.revenueByMonth.map((row) => ({
    label: monthLabel(row.month),
    values: [row.expected, row.received],
  }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card
        title="הכנסה לפי חודש"
        action={
          <button
            onClick={() => setShowTable((value) => !value)}
            className="text-xs font-medium text-brand"
            aria-expanded={showTable}
          >
            {showTable ? 'תצוגת תרשים' : 'תצוגת טבלה'}
          </button>
        }
      >
        {showTable ? (
          <Table className="min-w-0">
            <thead className="hairline">
              <tr>
                <Th>חודש</Th>
                <Th>צפוי</Th>
                <Th>התקבל</Th>
                <Th>השמות</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.revenueByMonth.map((row) => (
                <tr key={row.month}>
                  <Td>
                    <span className="num text-sm">{row.month}</span>
                  </Td>
                  <Td>
                    <span className="num text-sm">{formatMoney(row.expected)}</span>
                  </Td>
                  <Td>
                    <span className="num text-sm text-ok">{formatMoney(row.received)}</span>
                  </Td>
                  <Td>
                    <span className="num text-sm text-muted">{row.placements}</span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <GroupedBarChart
            rows={revenueRows}
            series={[
              { key: 'expected', label: 'צפוי' },
              { key: 'received', label: 'התקבל' },
            ]}
            format={(value) => formatMoney(value)}
            emptyText="אין עדיין תשלומים רשומים"
          />
        )}
      </Card>

      <Card title="משפך הגיוס">
        <Funnel steps={data.funnel} />
      </Card>

      <Card title="מקורות מועמדים">
        <RankedBars
          rows={data.sources.map((source) => ({
            label: source.label,
            value: source.candidates,
            sub: source.placements > 0 ? `${source.placements} השמות מהמקור הזה` : undefined,
          }))}
          emptyText="לא הוזנו מקורות הגעה"
        />
      </Card>

      <Card title="הכנסה לפי לקוח (התקבל)">
        <RankedBars
          rows={data.revenueByClient
            .filter((row) => row.received > 0)
            .slice(0, 8)
            .map((row) => ({ label: row.client_name, value: row.received }))}
          format={(value) => formatMoney(value)}
          emptyText="אין עדיין הכנסות שהתקבלו"
          seriesIndex={1}
        />
      </Card>
    </div>
  );
}
