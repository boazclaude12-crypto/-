'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/shell';
import { useMutation, useQuery } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/input';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { formatDate, formatMoney } from '@/lib/utils';

interface PromptsResponse {
  prompts: Array<{
    name: string;
    versions: Array<{ id: string; version: number; active: boolean; notes: string | null; updatedAt: string }>;
    stats: Array<{ version: number; runs: number; okRate: number; avgLatencyMs: number; avgCost: number }>;
  }>;
}

interface PromptDetail {
  name: string;
  versions: Array<{ id: string; version: number; active: boolean; systemPrompt: string; userTemplate: string; variables: string[]; notes: string | null }>;
}

export default function PromptsPage() {
  const { data, error, loading, refetch } = useQuery<PromptsResponse>('/api/prompts');
  const [editing, setEditing] = useState<string | null>(null);

  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (loading && !data) return <LoadingState />;

  return (
    <>
      <PageHeader
        title="Prompts"
        description="Every agent reads its prompt from here. Publish a new version, compare how it performs, roll back if it is worse — no deploy involved."
      />

      <div className="grid gap-3 md:grid-cols-2">
        {data?.prompts.map((prompt) => {
          const active = prompt.versions.find((v) => v.active);
          return (
            <Card key={prompt.name}>
              <CardHeader className="flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle className="font-mono text-xs">{prompt.name}</CardTitle>
                  <CardDescription className="mt-1">
                    {prompt.versions.length} version{prompt.versions.length === 1 ? '' : 's'} · active v{active?.version ?? '—'}
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => setEditing(prompt.name)}>
                  Edit
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {prompt.stats.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No runs recorded yet.</p>
                ) : (
                  prompt.stats.map((stat) => (
                    <div key={stat.version} className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-xs">
                      <div className="flex items-center gap-2">
                        <Badge variant={active?.version === stat.version ? 'success' : 'muted'}>v{stat.version}</Badge>
                        <span className="text-muted-foreground">{stat.runs} runs</span>
                      </div>
                      <div className="flex gap-3 tabular-nums text-muted-foreground">
                        <span>{Math.round(stat.okRate * 100)}% ok</span>
                        <span>{stat.avgLatencyMs}ms</span>
                        <span>{formatMoney(stat.avgCost, 4)}</span>
                      </div>
                    </div>
                  ))
                )}
                {active?.notes ? <p className="text-xs text-muted-foreground">{active.notes}</p> : null}
                <p className="text-xs text-muted-foreground">Updated {formatDate(active?.updatedAt, false)}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {editing ? <PromptEditor name={editing} onClose={() => setEditing(null)} onSaved={refetch} /> : null}
    </>
  );
}

function PromptEditor({ name, onClose, onSaved }: { name: string; onClose: () => void; onSaved: () => void }) {
  const { data, loading } = useQuery<PromptDetail>(`/api/prompts/${name}`);
  const active = data?.versions.find((v) => v.active) ?? data?.versions[data.versions.length - 1];
  const [systemPrompt, setSystemPrompt] = useState<string | null>(null);
  const [userTemplate, setUserTemplate] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  const save = useMutation(async (activate: boolean) => {
    await api.post(`/api/prompts/${name}/versions`, {
      systemPrompt: systemPrompt ?? active?.systemPrompt ?? '',
      userTemplate: userTemplate ?? active?.userTemplate ?? '',
      notes,
      activate,
    });
    onSaved();
    onClose();
  });

  const activate = useMutation(async (id: string) => {
    await api.post(`/api/prompts/versions/${id}/activate`);
    onSaved();
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm">{name}</DialogTitle>
        </DialogHeader>

        {loading || !active ? (
          <LoadingState />
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {data?.versions.map((version) => (
                <button
                  key={version.id}
                  type="button"
                  onClick={() => void activate.run(version.id)}
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                    version.active ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent'
                  }`}
                >
                  v{version.version}
                  {version.active ? ' · active' : ''}
                </button>
              ))}
            </div>

            <Field label="System prompt">
              <Textarea
                rows={10}
                className="font-mono text-xs"
                value={systemPrompt ?? active.systemPrompt}
                onChange={(event) => setSystemPrompt(event.target.value)}
              />
            </Field>
            <Field label="User template" hint={`Variables: ${active.variables.join(', ') || 'none'}`}>
              <Textarea
                rows={8}
                className="font-mono text-xs"
                value={userTemplate ?? active.userTemplate}
                onChange={(event) => setUserTemplate(event.target.value)}
              />
            </Field>
            <Field label="Notes">
              <Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="What changed and why" />
            </Field>

            {save.error ? <p className="text-sm text-destructive">{save.error}</p> : null}

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button variant="secondary" loading={save.pending} onClick={() => void save.run(false)}>
                Save as draft
              </Button>
              <Button loading={save.pending} onClick={() => void save.run(true)}>
                Save and activate
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
