import { PipelineError } from '../shared/errors.js';
import { PIPELINE_ORDER, type VideoStatus } from '../shared/types.js';

/**
 * The production state machine (spec §7). `Video.status` is written in exactly one place —
 * through this class — so an illegal jump is impossible rather than merely discouraged.
 */
const TRANSITIONS: Record<VideoStatus, VideoStatus[]> = {
  IDEA: ['RESEARCHING', 'FAILED'],
  RESEARCHING: ['RESEARCH_COMPLETE', 'FAILED'],
  RESEARCH_COMPLETE: ['SCRIPTING', 'FAILED'],
  SCRIPTING: ['SCRIPT_READY', 'FAILED'],
  SCRIPT_READY: ['FACT_CHECK', 'RESEARCH_COMPLETE', 'SCRIPTING', 'FAILED'],
  // A failed fact check sends the video back to RESEARCH_COMPLETE, which is the state the
  // script step runs from — that is what "rewrite the script" means mechanically.
  FACT_CHECK: ['SCENE_PLANNING', 'RESEARCH_COMPLETE', 'SCRIPTING', 'FAILED'],
  SCENE_PLANNING: ['GENERATING_VISUALS', 'FAILED'],
  GENERATING_VISUALS: ['GENERATING_VOICE', 'FAILED'],
  GENERATING_VOICE: ['EDITING', 'FAILED'],
  EDITING: ['QC', 'FAILED'],
  // QC can send work back to whichever stage produced the defect (spec §26).
  QC: ['THUMBNAIL', 'EDITING', 'GENERATING_VISUALS', 'GENERATING_VOICE', 'FAILED'],
  THUMBNAIL: ['SEO', 'FAILED'],
  SEO: ['READY', 'FAILED'],
  READY: ['SCHEDULED', 'THUMBNAIL', 'SEO', 'FAILED'],
  SCHEDULED: ['PUBLISHED', 'READY', 'FAILED'],
  PUBLISHED: ['ANALYZING'],
  ANALYZING: ['PUBLISHED'],
  // A failed video can be retried from the stage that broke.
  FAILED: [
    'IDEA',
    'RESEARCH_COMPLETE',
    'SCRIPT_READY',
    'SCENE_PLANNING',
    'GENERATING_VISUALS',
    'GENERATING_VOICE',
    'EDITING',
    'QC',
    'THUMBNAIL',
    'SEO',
    'READY',
    'SCHEDULED',
  ],
};

export class VideoStateMachine {
  static canTransition(from: VideoStatus, to: VideoStatus): boolean {
    if (from === to) return true;
    return TRANSITIONS[from]?.includes(to) ?? false;
  }

  static assert(from: VideoStatus, to: VideoStatus): void {
    if (!VideoStateMachine.canTransition(from, to)) {
      throw new PipelineError(
        `Illegal video state transition ${from} → ${to}`,
        { from, to, allowed: TRANSITIONS[from] },
        false,
      );
    }
  }

  static next(from: VideoStatus): VideoStatus[] {
    return [...(TRANSITIONS[from] ?? [])];
  }

  static isTerminal(status: VideoStatus): boolean {
    return status === 'FAILED' || status === 'PUBLISHED' || status === 'ANALYZING';
  }

  /** 0-100 position in the pipeline, for progress bars (spec §70). */
  static completion(status: VideoStatus): number {
    if (status === 'FAILED') return 0;
    const index = PIPELINE_ORDER.indexOf(status);
    if (index < 0) return 0;
    return Math.round((index / (PIPELINE_ORDER.length - 1)) * 100);
  }
}

/** Stage labels for the pipeline board, in order. */
export const PIPELINE_STAGES: Array<{ status: VideoStatus; label: string; group: string }> = [
  { status: 'IDEA', label: 'Idea', group: 'Plan' },
  { status: 'RESEARCHING', label: 'Researching', group: 'Plan' },
  { status: 'RESEARCH_COMPLETE', label: 'Research complete', group: 'Plan' },
  { status: 'SCRIPTING', label: 'Scripting', group: 'Write' },
  { status: 'SCRIPT_READY', label: 'Script ready', group: 'Write' },
  { status: 'FACT_CHECK', label: 'Fact checking', group: 'Write' },
  { status: 'SCENE_PLANNING', label: 'Scene planning', group: 'Produce' },
  { status: 'GENERATING_VISUALS', label: 'Generating visuals', group: 'Produce' },
  { status: 'GENERATING_VOICE', label: 'Generating voice', group: 'Produce' },
  { status: 'EDITING', label: 'Editing', group: 'Produce' },
  { status: 'QC', label: 'Quality control', group: 'Finish' },
  { status: 'THUMBNAIL', label: 'Thumbnail', group: 'Finish' },
  { status: 'SEO', label: 'SEO', group: 'Finish' },
  { status: 'READY', label: 'Ready', group: 'Publish' },
  { status: 'SCHEDULED', label: 'Scheduled', group: 'Publish' },
  { status: 'PUBLISHED', label: 'Published', group: 'Publish' },
  { status: 'ANALYZING', label: 'Analysing', group: 'Learn' },
];
