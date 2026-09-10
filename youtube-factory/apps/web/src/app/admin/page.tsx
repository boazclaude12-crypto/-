'use client';

import { PageHeader } from '@/components/shell';
import { useQuery } from '@/hooks/use-api';
import { Stat } from '@/components/stat';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { formatDate, formatMoney, formatNumber } from '@/lib/utils';

interface AdminStats {
  totals: { users: number; channels: number; videos: number; published: number };
  cost: { month: number; byProvider: Array<{ provider: string; cost: number; calls: number }> };
  jobs: {
    byState: Record<string, number>;
    queues: Array<{ queue: string; counts: { waiting: number; active: number; delayed: number; completed: number; failed: number } | null }>;
  };
  errors: Array<{ jobId: string; attempt: number; message: string; createdAt: string }>;
  providers: Array<{ key: string; configured: boolean; healthy: boolean }>;
}

interface AdminUsers {
  users: Array<{ id: string; email: string; role: string; createdAt: string; channels: number }>;
}

export default function AdminPage() {
  const { data, error, loading, refetch } = useQuery<AdminStats>('/api/admin/stats', { pollMs: 30_000 });
  const { data: users } = useQuery<AdminUsers>('/api/admin/users');

  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (loading && !data) return <LoadingState />;
  if (!data) return null;

  return (
    <>
      <PageHeader title="Admin" description="Instance-wide health, spend and failures." />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Users" value={formatNumber(data.totals.users)} />
        <Stat label="Channels" value={formatNumber(data.totals.channels)} />
        <Stat label="Videos generated" value={formatNumber(data.totals.videos)} hint={`${data.totals.published} published`} />
        <Stat label="AI spend this month" value={formatMoney(data.cost.month)} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Queues</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>Queue</TH>
                  <TH>Waiting</TH>
                  <TH>Active</TH>
                  <TH>Delayed</TH>
                  <TH>Done</TH>
                  <TH>Failed</TH>
                </TR>
              </THead>
              <TBody>
                {data.jobs.queues.map((entry) => (
                  <TR key={entry.queue}>
                    <TD className="font-medium">{entry.queue}</TD>
                    <TD className="tabular-nums">{entry.counts?.waiting ?? '—'}</TD>
                    <TD className="tabular-nums">{entry.counts?.active ?? '—'}</TD>
                    <TD className="tabular-nums">{entry.counts?.delayed ?? '—'}</TD>
                    <TD className="tabular-nums">{entry.counts?.completed ?? '—'}</TD>
                    <TD className="tabular-nums text-destructive">{entry.counts?.failed ?? '—'}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {Object.entries(data.jobs.byState).map(([state, count]) => (
                <Badge key={state} variant={state === 'FAILED' ? 'destructive' : 'secondary'}>
                  {state.toLowerCase()}: {count}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Providers</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1.5">
            {data.providers.map((provider) => (
              <Badge key={provider.key} variant={!provider.configured ? 'muted' : provider.healthy ? 'success' : 'destructive'}>
                {provider.key}
              </Badge>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Recent job errors</CardTitle>
        </CardHeader>
        <CardContent>
          {data.errors.length === 0 ? (
            <p className="text-sm text-muted-foreground">No job errors recorded.</p>
          ) : (
            <ul className="space-y-1.5">
              {data.errors.map((entry, index) => (
                <li key={`${entry.jobId}-${index}`} className="rounded-md border p-2.5">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-mono">{entry.jobId}</span>
                    <span>attempt {entry.attempt} · {formatDate(entry.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-sm text-destructive">{entry.message}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {users ? (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Users</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>Email</TH>
                  <TH>Role</TH>
                  <TH>Channels</TH>
                  <TH>Joined</TH>
                </TR>
              </THead>
              <TBody>
                {users.users.map((user) => (
                  <TR key={user.id}>
                    <TD className="font-medium">{user.email}</TD>
                    <TD><Badge variant={user.role === 'ADMIN' ? 'default' : 'muted'}>{user.role.toLowerCase()}</Badge></TD>
                    <TD className="tabular-nums">{user.channels}</TD>
                    <TD className="text-muted-foreground">{formatDate(user.createdAt, false)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
