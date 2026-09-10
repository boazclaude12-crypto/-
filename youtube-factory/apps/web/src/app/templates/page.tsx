'use client';

import { PageHeader } from '@/components/shell';
import { useQuery } from '@/hooks/use-api';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';

interface Template {
  id: string;
  name: string;
  description: string | null;
  visualStyle: string;
  musicMood: string | null;
  sceneDurationSec: number;
  thumbnailStyle: string | null;
  isSystem: boolean;
  scriptStructure: { structure?: string; beats?: string[] };
}

export default function TemplatesPage() {
  const { data, error, loading, refetch } = useQuery<{ templates: Template[] }>('/api/templates');

  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (loading && !data) return <LoadingState />;

  return (
    <>
      <PageHeader
        title="Content templates"
        description="A complete production profile: how the script is shaped, how it looks, how fast it cuts."
      />

      {data && data.templates.length === 0 ? (
        <EmptyState title="No templates" description="Templates are seeded when your account is created." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data?.templates.map((template) => (
            <Card key={template.id}>
              <CardHeader className="flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle>{template.name}</CardTitle>
                  <CardDescription className="mt-1">{template.description}</CardDescription>
                </div>
                {template.isSystem ? <Badge variant="muted">built-in</Badge> : null}
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {template.scriptStructure.structure ? (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Structure</p>
                    <p>{template.scriptStructure.structure}</p>
                  </div>
                ) : null}
                {template.scriptStructure.beats ? (
                  <ol className="list-inside list-decimal space-y-0.5 text-xs text-muted-foreground">
                    {template.scriptStructure.beats.map((beat) => (
                      <li key={beat}>{beat}</li>
                    ))}
                  </ol>
                ) : null}
                <div className="space-y-1 border-t pt-2 text-xs text-muted-foreground">
                  <p><span className="font-medium text-foreground">Visual:</span> {template.visualStyle}</p>
                  {template.musicMood ? <p><span className="font-medium text-foreground">Music:</span> {template.musicMood}</p> : null}
                  <p><span className="font-medium text-foreground">Scene length:</span> {template.sceneDurationSec}s</p>
                  {template.thumbnailStyle ? (
                    <p><span className="font-medium text-foreground">Thumbnail:</span> {template.thumbnailStyle}</p>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
