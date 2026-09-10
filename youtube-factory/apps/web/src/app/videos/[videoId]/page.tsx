'use client';

import { use } from 'react';
import Link from 'next/link';
import {
  CalendarClock, CheckCircle2, ExternalLink, RefreshCw, Upload, XCircle,
} from 'lucide-react';
import { PageHeader } from '@/components/shell';
import { useMutation, useQuery } from '@/hooks/use-api';
import { api, type Stage, type VideoSummary, type VideoStatus } from '@/lib/api';
import { ScoreBar, ScorePill } from '@/components/score';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { formatDate, formatDuration, formatMoney, formatNumber, formatPercent } from '@/lib/utils';

interface VideoDetail {
  video: VideoSummary & { qualityBreakdown: Record<string, number> | null; renderKey: string | null };
  channel: { id: string; name: string; youtubeChannelId: string | null };
  stages: Stage[];
  research: {
    topic: string; summary: string; confidence: number; openQuestions: string[] | null;
    sources: Array<{ id: string; claim: string; source: string; sourceUrl: string | null; sourceType: string; confidence: number; verdict: string }>;
  } | null;
  script: {
    structure: string; hook: string; intro: string; cta: string; wordCount: number;
    estimatedDuration: number; retentionScore: number | null; factCheckScore: number | null; revision: number;
    sections: Array<{ heading: string; narration: string; targetSeconds: number; patternInterrupt?: string }>;
    retentionNotes: Array<{ name: string; passed: boolean; detail: string }> | null;
  } | null;
  scenes: Array<{ id: string; index: number; durationSec: number; narration: string; visualBrief: string; prompt: string; strategy: string; importance: number; camera: string | null; motion: string | null; textOverlay: string | null }>;
  assets: Array<{ id: string; kind: string; mimeType: string; bytes: number | null; provider: string | null; costUsd: number; license: string | null; url: string }>;
  voiceovers: Array<{ index: number; text: string; durationSec: number; provider: string; voiceId: string }>;
  thumbnails: Array<{ id: string; variant: string; concept: string; ctrPotential: number; selected: boolean; url: string | null }>;
  seo: { title: string; description: string; tags: string[]; hashtags: string[]; chapters: Array<{ startSec: number; title: string }>; titleCandidates: Array<{ text: string; category: string; score: number; reason: string }> } | null;
  qc: Array<{ id: string; passed: boolean; score: number; checks: Array<{ name: string; passed: boolean; severity: string; detail: string }>; repairs: string[] | null; createdAt: string }>;
  upload: { state: string; youtubeVideoId: string | null; error: string | null } | null;
  analytics: Array<{ capturedAt: string; views: number; ctr: number; averageViewPercentage: number; watchTimeMinutes: number; subscribersGained: number }>;
  decisions: Array<{ id: string; subject: string; decision: string; reason: string; score: number | null; createdAt: string }>;
  jobs: Array<{ id: string; name: string; state: string; attemptCount: number; lastError: string | null; createdAt: string }>;
  agentRuns: Array<{ id: string; agent: string; promptName: string; promptVersion: number; provider: string; model: string | null; ok: boolean; latencyMs: number; costUsd: number; error: string | null }>;
  timeline: { durationSec: number; scenes: unknown[]; width: number; height: number; fps: number } | null;
  renderCommand: string | null;
  costUsd: number;
  renderUrl: string | null;
}

const ACTIVE: VideoStatus[] = [
  'RESEARCHING', 'SCRIPTING', 'FACT_CHECK', 'SCENE_PLANNING',
  'GENERATING_VISUALS', 'GENERATING_VOICE', 'EDITING', 'QC', 'THUMBNAIL', 'SEO',
];

export default function VideoDetailPage({ params }: { params: Promise<{ videoId: string }> }) {
  const { videoId } = use(params);
  const { data, error, loading, refetch } = useQuery<VideoDetail>(`/api/videos/${videoId}`, { pollMs: 8_000 });

  const advance = useMutation(async () => {
    await api.post(`/api/videos/${videoId}/advance`);
    refetch();
  });
  const approve = useMutation(async () => {
    await api.post(`/api/videos/${videoId}/approve`);
    refetch();
  });
  const retry = useMutation(async () => {
    await api.post(`/api/videos/${videoId}/retry`, {});
    refetch();
  });
  const schedule = useMutation(async () => {
    await api.post(`/api/videos/${videoId}/schedule`, {});
    refetch();
  });
  const upload = useMutation(async () => {
    await api.post(`/api/videos/${videoId}/upload`);
    refetch();
  });
  const selectThumbnail = useMutation(async (variant: string) => {
    await api.post(`/api/videos/${videoId}/thumbnail`, { variant });
    refetch();
  });

  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (loading && !data) return <LoadingState />;
  if (!data) return null;

  const { video } = data;
  const isActive = ACTIVE.includes(video.status);
  const latestQc = data.qc[0];
  const latestAnalytics = data.analytics[data.analytics.length - 1];
  const actionError = advance.error ?? approve.error ?? retry.error ?? schedule.error ?? upload.error;

  return (
    <>
      <PageHeader
        title={video.title}
        description={`${data.channel.name} · ${formatDuration(video.actualDurationSec ?? video.targetDurationSec)} · ${formatMoney(data.costUsd)}`}
        badge={
          <>
            <StatusBadge status={video.status} />
            {video.qualityScore !== null ? <ScorePill score={video.qualityScore} label="quality" /> : null}
          </>
        }
        actions={
          <>
            {video.status === 'FAILED' ? (
              <Button size="sm" loading={retry.pending} onClick={() => void retry.run()}>
                <RefreshCw className="h-4 w-4" aria-hidden />
                Retry
              </Button>
            ) : null}
            {video.status === 'READY' ? (
              <>
                <Button variant="outline" size="sm" loading={approve.pending} onClick={() => void approve.run()}>
                  <CheckCircle2 className="h-4 w-4" aria-hidden />
                  Approve
                </Button>
                <Button size="sm" loading={schedule.pending} onClick={() => void schedule.run()}>
                  <CalendarClock className="h-4 w-4" aria-hidden />
                  Schedule
                </Button>
              </>
            ) : null}
            {video.status === 'SCHEDULED' ? (
              <Button size="sm" loading={upload.pending} onClick={() => void upload.run()}>
                <Upload className="h-4 w-4" aria-hidden />
                Upload now
              </Button>
            ) : null}
            {video.youtubeVideoId ? (
              <Button asChild variant="outline" size="sm">
                <a href={`https://www.youtube.com/watch?v=${video.youtubeVideoId}`} target="_blank" rel="noreferrer">
                  Watch on YouTube
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </a>
              </Button>
            ) : null}
            {!isActive && video.status !== 'PUBLISHED' && video.status !== 'FAILED' ? (
              <Button variant="secondary" size="sm" loading={advance.pending} onClick={() => void advance.run()}>
                Advance a stage
              </Button>
            ) : null}
          </>
        }
      />

      {actionError ? (
        <p className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{actionError}</p>
      ) : null}
      {video.failureReason ? (
        <p className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{video.failureReason}</p>
      ) : null}

      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {data.stages.map((stage) => (
              <div key={stage.status} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className={stage.reached ? 'font-medium' : 'text-muted-foreground'}>{stage.label}</span>
                  <span className="tabular-nums text-muted-foreground">{Math.round(stage.percent)}%</span>
                </div>
                <Progress value={stage.percent} className="h-1.5" tone={stage.percent === 100 ? 'success' : 'primary'} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="research">Research</TabsTrigger>
          <TabsTrigger value="script">Script</TabsTrigger>
          <TabsTrigger value="scenes">Scenes</TabsTrigger>
          <TabsTrigger value="assets">Assets</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="thumbnail">Thumbnail</TabsTrigger>
          <TabsTrigger value="seo">SEO</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Why the factory did what it did</CardTitle>
                <CardDescription>Every automated decision, with the numbers behind it.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.decisions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No decisions recorded yet.</p>
                ) : (
                  data.decisions.map((decision) => (
                    <div key={decision.id} className="rounded-md border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">{decision.subject}</p>
                        {decision.score !== null ? <ScorePill score={decision.score} /> : null}
                      </div>
                      <p className="mt-0.5 text-sm">{decision.decision}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{decision.reason}</p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Quality breakdown</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  {video.qualityBreakdown && Object.keys(video.qualityBreakdown).length > 0 ? (
                    Object.entries(video.qualityBreakdown).map(([key, score]) => (
                      <ScoreBar key={key} label={key} score={score} />
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">Available after quality control runs.</p>
                  )}
                </CardContent>
              </Card>

              {data.renderUrl ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Render</CardTitle>
                    <CardDescription>
                      {data.timeline ? `${data.timeline.width}×${data.timeline.height} at ${data.timeline.fps}fps` : null}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="break-all font-mono text-xs text-muted-foreground">{video.renderKey}</p>
                    <p className="mt-2 text-sm">
                      {formatDuration(video.actualDurationSec)} · {formatNumber((video as unknown as { fileSizeBytes: number }).fileSizeBytes / 1_000_000)} MB
                    </p>
                  </CardContent>
                </Card>
              ) : null}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="research">
          {!data.research ? (
            <EmptyState title="No research yet" description="Research runs as the first stage of production." />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>{data.research.topic}</CardTitle>
                <CardDescription>
                  Aggregate fact confidence {formatPercent(data.research.confidence * 100, 0)} across{' '}
                  {data.research.sources.length} findings.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm">{data.research.summary}</p>
                <Table>
                  <THead>
                    <TR>
                      <TH>Claim</TH>
                      <TH>Source</TH>
                      <TH>Verdict</TH>
                      <TH>Confidence</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {data.research.sources.map((source) => (
                      <TR key={source.id}>
                        <TD className="max-w-md">{source.claim}</TD>
                        <TD className="text-muted-foreground">
                          {source.sourceUrl ? (
                            <a href={source.sourceUrl} target="_blank" rel="noreferrer" className="hover:underline">
                              {source.source}
                            </a>
                          ) : (
                            source.source
                          )}
                        </TD>
                        <TD>
                          <Badge variant={source.verdict === 'SUPPORTED' ? 'success' : source.verdict === 'CONTRADICTED' ? 'destructive' : 'warning'}>
                            {source.verdict.toLowerCase()}
                          </Badge>
                        </TD>
                        <TD className="tabular-nums">{formatPercent(source.confidence * 100, 0)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
                {data.research.openQuestions?.length ? (
                  <div>
                    <p className="mb-1.5 text-sm font-medium">Open questions</p>
                    <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                      {data.research.openQuestions.map((question) => (
                        <li key={question}>{question}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="script">
          {!data.script ? (
            <EmptyState title="No script yet" />
          ) : (
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Script — {data.script.structure}</CardTitle>
                  <CardDescription>
                    {data.script.wordCount} words · {formatDuration(data.script.estimatedDuration)} · revision {data.script.revision}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <section>
                    <Badge variant="default">Hook</Badge>
                    <p className="mt-1.5 text-sm leading-relaxed">{data.script.hook}</p>
                  </section>
                  <section>
                    <Badge variant="secondary">Intro</Badge>
                    <p className="mt-1.5 text-sm leading-relaxed">{data.script.intro}</p>
                  </section>
                  {data.script.sections.map((section, index) => (
                    <section key={`${section.heading}-${index}`} className="border-t pt-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold">{section.heading}</h3>
                        <span className="text-xs text-muted-foreground">{section.targetSeconds}s</span>
                      </div>
                      <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed">{section.narration}</p>
                      {section.patternInterrupt ? (
                        <p className="mt-1.5 text-xs text-muted-foreground">Pattern interrupt: {section.patternInterrupt}</p>
                      ) : null}
                    </section>
                  ))}
                  <section className="border-t pt-3">
                    <Badge variant="secondary">Call to action</Badge>
                    <p className="mt-1.5 text-sm leading-relaxed">{data.script.cta}</p>
                  </section>
                </CardContent>
              </Card>

              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Retention review</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <ScoreBar label="Retention score" score={data.script.retentionScore} />
                    <ScoreBar label="Fact confidence" score={(data.script.factCheckScore ?? 0) * 100} />
                    <ul className="space-y-1.5 pt-1">
                      {(data.script.retentionNotes ?? []).map((note) => (
                        <li key={note.name} className="flex gap-2 text-xs">
                          {note.passed ? (
                            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" aria-hidden />
                          ) : (
                            <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />
                          )}
                          <span className="text-muted-foreground">
                            <span className="font-medium text-foreground">{note.name}</span> — {note.detail}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="scenes">
          {data.scenes.length === 0 ? (
            <EmptyState title="No scenes yet" />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {data.scenes.map((scene) => (
                <Card key={scene.id}>
                  <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle>Scene {scene.index + 1}</CardTitle>
                    <div className="flex gap-1">
                      <Badge variant="secondary">{scene.durationSec.toFixed(1)}s</Badge>
                      <Badge variant="muted">{scene.strategy.replace('_', ' ').toLowerCase()}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <p className="line-clamp-3 text-muted-foreground">{scene.narration}</p>
                    <p className="rounded-md bg-muted/50 p-2 font-mono text-xs">{scene.prompt}</p>
                    <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
                      {scene.camera ? <span>Camera: {scene.camera}</span> : null}
                      {scene.motion ? <span>· Motion: {scene.motion}</span> : null}
                      <span>· Importance {(scene.importance * 100).toFixed(0)}%</span>
                    </div>
                    {scene.textOverlay ? <Badge variant="default">Overlay: {scene.textOverlay}</Badge> : null}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="assets">
          <Card>
            <CardHeader>
              <CardTitle>Assets</CardTitle>
              <CardDescription>Everything produced for this video, with provider, licence and cost.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <THead>
                  <TR>
                    <TH>Kind</TH>
                    <TH>Type</TH>
                    <TH>Size</TH>
                    <TH>Provider</TH>
                    <TH>Licence</TH>
                    <TH>Cost</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.assets.map((asset) => (
                    <TR key={asset.id}>
                      <TD><Badge variant="secondary">{asset.kind}</Badge></TD>
                      <TD className="font-mono text-xs text-muted-foreground">{asset.mimeType}</TD>
                      <TD className="tabular-nums text-muted-foreground">
                        {asset.bytes ? `${(asset.bytes / 1024).toFixed(0)} KB` : '—'}
                      </TD>
                      <TD>{asset.provider ?? '—'}</TD>
                      <TD className="text-muted-foreground">{asset.license ?? '—'}</TD>
                      <TD className="tabular-nums">{formatMoney(asset.costUsd)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>

              {data.voiceovers.length > 0 ? (
                <div className="mt-5">
                  <h3 className="mb-2 text-sm font-semibold">Narration segments</h3>
                  <ul className="space-y-1.5">
                    {data.voiceovers.map((clip) => (
                      <li key={clip.index} className="rounded-md border p-2.5 text-sm">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Segment {clip.index + 1} · {clip.provider} / {clip.voiceId}</span>
                          <span className="tabular-nums">{formatDuration(clip.durationSec)}</span>
                        </div>
                        <p className="mt-1 line-clamp-2">{clip.text}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timeline">
          {!data.timeline ? (
            <EmptyState title="No timeline yet" description="The timeline is built when the video is edited." />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Timeline</CardTitle>
                <CardDescription>
                  {data.timeline.scenes.length} scenes · {formatDuration(data.timeline.durationSec)} ·{' '}
                  {data.timeline.width}×{data.timeline.height} at {data.timeline.fps}fps
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs scrollbar-thin">
                  {JSON.stringify(data.timeline, null, 2)}
                </pre>
                {data.renderCommand ? (
                  <details>
                    <summary className="cursor-pointer text-sm font-medium">FFmpeg command</summary>
                    <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-muted p-3 text-xs scrollbar-thin">
                      {data.renderCommand}
                    </pre>
                  </details>
                ) : null}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="thumbnail">
          {data.thumbnails.length === 0 ? (
            <EmptyState title="No thumbnails yet" />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.thumbnails.map((thumbnail) => (
                <Card key={thumbnail.id} className={thumbnail.selected ? 'ring-2 ring-primary' : undefined}>
                  <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle>Variant {thumbnail.variant}</CardTitle>
                    <ScorePill score={thumbnail.ctrPotential} label="CTR" />
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="aspect-video overflow-hidden rounded-md bg-muted">
                      {thumbnail.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumbnail.url} alt={`Thumbnail ${thumbnail.variant}`} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                          Not rendered
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{thumbnail.concept}</p>
                    <Button
                      variant={thumbnail.selected ? 'secondary' : 'outline'}
                      size="sm"
                      className="w-full"
                      disabled={thumbnail.selected || !thumbnail.url}
                      loading={selectThumbnail.pending}
                      onClick={() => void selectThumbnail.run(thumbnail.variant)}
                    >
                      {thumbnail.selected ? 'Selected' : 'Use this one'}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="seo">
          {!data.seo ? (
            <EmptyState title="No metadata yet" />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Published metadata</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Title</p>
                    <p className="text-sm font-medium">{data.seo.title}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Description</p>
                    <p className="whitespace-pre-line text-sm">{data.seo.description}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Tags</p>
                    <div className="flex flex-wrap gap-1">
                      {data.seo.tags.map((tag) => (
                        <Badge key={tag} variant="secondary">{tag}</Badge>
                      ))}
                    </div>
                  </div>
                  {data.seo.chapters.length > 0 ? (
                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">Chapters</p>
                      <ul className="space-y-0.5 font-mono text-xs">
                        {data.seo.chapters.map((chapter) => (
                          <li key={chapter.startSec}>
                            {formatTimestamp(chapter.startSec)} {chapter.title}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Title candidates</CardTitle>
                  <CardDescription>Ranked by predicted performance across categories.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {data.seo.titleCandidates.map((candidate) => (
                    <div key={candidate.text} className="rounded-md border p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium">{candidate.text}</p>
                        <ScorePill score={candidate.score} />
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge variant="muted">{candidate.category}</Badge>
                        <p className="text-xs text-muted-foreground">{candidate.reason}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="analytics">
          {data.analytics.length === 0 ? (
            <EmptyState title="No analytics yet" description="Collected after the video has been live for a day." />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Performance</CardTitle>
                <CardDescription>Latest capture {formatDate(latestAnalytics?.capturedAt)}</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <THead>
                    <TR>
                      <TH>Captured</TH>
                      <TH>Views</TH>
                      <TH>Watch time</TH>
                      <TH>Avg viewed</TH>
                      <TH>CTR</TH>
                      <TH>Subs</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {data.analytics.map((snapshot) => (
                      <TR key={snapshot.capturedAt}>
                        <TD className="whitespace-nowrap text-muted-foreground">{formatDate(snapshot.capturedAt)}</TD>
                        <TD className="tabular-nums">{formatNumber(snapshot.views)}</TD>
                        <TD className="tabular-nums">{formatNumber(snapshot.watchTimeMinutes)} min</TD>
                        <TD className="tabular-nums">{formatPercent(snapshot.averageViewPercentage)}</TD>
                        <TD className="tabular-nums">{formatPercent(snapshot.ctr)}</TD>
                        <TD className="tabular-nums">{formatNumber(snapshot.subscribersGained)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="logs">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Quality control</CardTitle>
                {latestQc ? (
                  <CardDescription>
                    Latest run {formatDate(latestQc.createdAt)} — {latestQc.passed ? 'passed' : 'failed'} at {latestQc.score}/100
                  </CardDescription>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-1.5">
                {!latestQc ? (
                  <p className="text-sm text-muted-foreground">Quality control has not run yet.</p>
                ) : (
                  latestQc.checks.map((check) => (
                    <div key={check.name} className="flex items-start gap-2 rounded-md border p-2 text-xs">
                      {check.passed ? (
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" aria-hidden />
                      ) : (
                        <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium">
                          {check.name} <span className="font-normal text-muted-foreground">({check.severity})</span>
                        </p>
                        <p className="text-muted-foreground">{check.detail}</p>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Agent runs</CardTitle>
                  <CardDescription>Which prompt version produced what, and what it cost.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <THead>
                      <TR>
                        <TH>Agent</TH>
                        <TH>Provider</TH>
                        <TH>Prompt</TH>
                        <TH>Latency</TH>
                        <TH>Cost</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {data.agentRuns.map((run) => (
                        <TR key={run.id}>
                          <TD className="font-medium">
                            {run.agent.replace('_AGENT', '')}
                            {!run.ok ? <Badge variant="destructive" className="ml-1">failed</Badge> : null}
                          </TD>
                          <TD className="text-muted-foreground">{run.model ?? run.provider}</TD>
                          <TD className="text-muted-foreground">v{run.promptVersion}</TD>
                          <TD className="tabular-nums text-muted-foreground">{run.latencyMs}ms</TD>
                          <TD className="tabular-nums">{formatMoney(run.costUsd)}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Jobs</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  {data.jobs.map((job) => (
                    <div key={job.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-xs">
                      <span className="font-mono">{job.name}</span>
                      <div className="flex items-center gap-2">
                        {job.attemptCount > 1 ? <span className="text-muted-foreground">{job.attemptCount} attempts</span> : null}
                        <Badge variant={job.state === 'SUCCEEDED' ? 'success' : job.state === 'FAILED' ? 'destructive' : 'muted'}>
                          {job.state.toLowerCase()}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <p className="mt-6 text-xs text-muted-foreground">
        <Link href="/videos" className="hover:underline">← Back to videos</Link>
      </p>
    </>
  );
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const h = Math.floor(m / 60);
  return h > 0
    ? `${h}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
