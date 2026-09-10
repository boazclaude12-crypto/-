import { Badge, type BadgeProps } from '@/components/ui/badge';
import type { VideoStatus } from '@/lib/api';

const LABELS: Record<VideoStatus, string> = {
  IDEA: 'Idea',
  RESEARCHING: 'Researching',
  RESEARCH_COMPLETE: 'Research done',
  SCRIPTING: 'Scripting',
  SCRIPT_READY: 'Script ready',
  FACT_CHECK: 'Fact checking',
  SCENE_PLANNING: 'Scene planning',
  GENERATING_VISUALS: 'Visuals',
  GENERATING_VOICE: 'Voice',
  EDITING: 'Editing',
  QC: 'Quality control',
  THUMBNAIL: 'Thumbnail',
  SEO: 'SEO',
  READY: 'Ready',
  SCHEDULED: 'Scheduled',
  PUBLISHED: 'Published',
  ANALYZING: 'Analysing',
  FAILED: 'Failed',
};

const VARIANTS: Record<VideoStatus, BadgeProps['variant']> = {
  IDEA: 'muted',
  RESEARCHING: 'default',
  RESEARCH_COMPLETE: 'default',
  SCRIPTING: 'default',
  SCRIPT_READY: 'default',
  FACT_CHECK: 'default',
  SCENE_PLANNING: 'default',
  GENERATING_VISUALS: 'default',
  GENERATING_VOICE: 'default',
  EDITING: 'default',
  QC: 'warning',
  THUMBNAIL: 'default',
  SEO: 'default',
  READY: 'success',
  SCHEDULED: 'success',
  PUBLISHED: 'success',
  ANALYZING: 'secondary',
  FAILED: 'destructive',
};

export function StatusBadge({ status }: { status: VideoStatus }) {
  return <Badge variant={VARIANTS[status]}>{LABELS[status] ?? status}</Badge>;
}

export function statusLabel(status: VideoStatus): string {
  return LABELS[status] ?? status;
}
