'use client';

import { PageHeader } from '@/components/shell';
import { useQuery } from '@/hooks/use-api';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState, LoadingState } from '@/components/ui/states';

interface ProvidersResponse {
  offline: boolean;
  providers: Array<{
    key: string; name: string; capabilities: string[]; configured: boolean;
    missingEnv: string[]; healthy: boolean; detail?: string; latencyMs?: number;
  }>;
  notifications: Array<{ kind: string; configured: boolean }>;
  storage: string;
  queue: string;
  ffmpeg: boolean;
}

export default function ProvidersPage() {
  const { data, error, loading, refetch } = useQuery<ProvidersResponse>('/api/providers');

  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (loading && !data) return <LoadingState />;
  if (!data) return null;

  return (
    <>
      <PageHeader
        title="Providers"
        description="A provider without credentials is never selected — the factory routes around it rather than failing."
        badge={data.offline ? <Badge variant="warning">Offline mode — mock providers</Badge> : undefined}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <span className="text-sm text-muted-foreground">Queue</span>
            <Badge variant="secondary">{data.queue}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <span className="text-sm text-muted-foreground">Storage</span>
            <Badge variant="secondary">{data.storage}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <span className="text-sm text-muted-foreground">FFmpeg</span>
            <Badge variant={data.ffmpeg ? 'success' : 'destructive'}>{data.ffmpeg ? 'available' : 'missing'}</Badge>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {data.providers.map((provider) => (
          <Card key={provider.key}>
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle>{provider.name}</CardTitle>
                <CardDescription className="mt-1 font-mono text-xs">{provider.key}</CardDescription>
              </div>
              <Badge variant={!provider.configured ? 'muted' : provider.healthy ? 'success' : 'destructive'}>
                {!provider.configured ? 'not configured' : provider.healthy ? 'healthy' : 'unhealthy'}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-1">
                {provider.capabilities.map((capability) => (
                  <Badge key={capability} variant="secondary">{capability}</Badge>
                ))}
              </div>
              {!provider.configured && provider.missingEnv.length > 0 ? (
                <div className="rounded-md bg-muted/60 p-3">
                  <p className="text-xs font-medium">Set these environment variables, then restart:</p>
                  <ul className="mt-1 space-y-0.5">
                    {provider.missingEnv.map((variable) => (
                      <li key={variable} className="font-mono text-xs text-muted-foreground">{variable}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {provider.detail ? <p className="text-xs text-muted-foreground">{provider.detail}</p> : null}
              {provider.latencyMs !== undefined ? (
                <p className="text-xs text-muted-foreground">Health check took {provider.latencyMs}ms</p>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Notification channels</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {data.notifications.map((channel) => (
            <Badge key={channel.kind} variant={channel.configured ? 'success' : 'muted'}>
              {channel.kind} {channel.configured ? '' : '(not configured)'}
            </Badge>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
