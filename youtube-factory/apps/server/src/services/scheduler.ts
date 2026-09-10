import type { ChannelSettingsRepository, ScheduleRepository, VideoRepository } from '../db/ports.js';
import type { ChannelSettingsRecord, ScheduleSlotRecord } from '../db/types.js';
import type { Clock } from '../shared/clock.js';
import { parseHhMm, toZonedParts, zonedTimeToUtc } from '../shared/time.js';

export interface SlotAssignment {
  slot: ScheduleSlotRecord;
  publishAt: Date;
  reason: string;
}

/**
 * Scheduling engine (spec §31, §33).
 *
 * The channel declares its publishing rhythm as days-of-week plus a local time — "Monday,
 * Wednesday, Friday at 18:00 Europe/Berlin". The scheduler converts that to UTC instants
 * through the tz database, so a daylight-saving change moves the upload with the viewer's
 * clock rather than an hour away from it.
 *
 * Slots are reserved, not merely computed: a video that finishes late cannot steal a slot
 * another video already holds, and a video that fails releases its slot for the next one.
 */
export class SchedulingEngine {
  constructor(
    private readonly schedules: ScheduleRepository,
    private readonly settings: ChannelSettingsRepository,
    private readonly videos: VideoRepository,
    private readonly clock: Clock,
  ) {}

  /** The next N publish instants for a channel, whether or not they are taken. */
  async upcomingSlots(channelId: string, count: number, from?: Date): Promise<Date[]> {
    const settings = await this.settings.findByChannel(channelId);
    if (!settings) return [];
    return computeSlots(settings, from ?? this.clock.now(), count);
  }

  /** Reserves the earliest free slot for a video (spec §33). */
  async reserve(channelId: string, videoId: string, opts: { minLeadMinutes?: number } = {}): Promise<SlotAssignment> {
    const settings = await this.settings.findByChannel(channelId);
    if (!settings) throw new Error(`Channel ${channelId} has no settings`);

    const existing = await this.schedules.findByVideo(videoId);
    if (existing) {
      return {
        slot: existing,
        publishAt: existing.publishAt,
        reason: 'This video already holds a slot.',
      };
    }

    const now = this.clock.now();
    // YouTube requires a scheduled publish time to be in the future; leave real headroom
    // so processing on their side finishes before the slot arrives.
    const earliest = new Date(now.getTime() + (opts.minLeadMinutes ?? 30) * 60_000);
    const taken = new Set(
      (await this.schedules.listUpcoming(channelId, earliest))
        .filter((s) => s.reserved && s.videoId)
        .map((s) => s.publishAt.getTime()),
    );

    const candidates = computeSlots(settings, earliest, taken.size + 8);
    const free = candidates.find((date) => !taken.has(date.getTime()));
    const publishAt = free ?? new Date(earliest.getTime() + 86_400_000);

    const slot = await this.schedules.create({
      channelId,
      videoId,
      publishAt,
      timezone: settings.timezone,
      reserved: true,
    });

    await this.videos.update(videoId, { publishAt });

    return {
      slot,
      publishAt,
      reason: free
        ? `Next free slot on the channel's ${describeDays(settings.publishDays)} ${settings.defaultPublishTime} (${settings.timezone}) schedule.`
        : 'No configured slot was free within the lookahead window; scheduled 24 hours out instead.',
    };
  }

  /** Frees a slot — used when production fails or a video is cancelled. */
  async release(videoId: string): Promise<void> {
    await this.schedules.release(videoId);
    await this.videos.update(videoId, { publishAt: null });
  }

  /**
   * Recomputes the queue after a delay (spec §33): videos that are ready keep the earliest
   * slots, in the order they became ready.
   */
  async recalculate(channelId: string): Promise<SlotAssignment[]> {
    const now = this.clock.now();
    const scheduled = await this.videos.listByChannel(channelId, { status: ['READY', 'SCHEDULED'] });
    const ordered = [...scheduled.items].sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());

    const settings = await this.settings.findByChannel(channelId);
    if (!settings) return [];
    const slots = computeSlots(settings, new Date(now.getTime() + 30 * 60_000), ordered.length + 2);

    const assignments: SlotAssignment[] = [];
    for (const [i, video] of ordered.entries()) {
      const publishAt = slots[i];
      if (!publishAt) break;
      const current = await this.schedules.findByVideo(video.id);
      const slot = current
        ? await this.schedules.update(current.id, { publishAt, reserved: true })
        : await this.schedules.create({
            channelId,
            videoId: video.id,
            publishAt,
            timezone: settings.timezone,
            reserved: true,
          });
      await this.videos.update(video.id, { publishAt });
      assignments.push({
        slot,
        publishAt,
        reason: `Reordered to position ${i + 1} in the publishing queue after a production delay.`,
      });
    }
    return assignments;
  }
}

/**
 * Publishing instants for a channel, in order, starting at or after `from`.
 * Exported so the calendar view and the tests can compute the same series.
 */
export function computeSlots(settings: ChannelSettingsRecord, from: Date, count: number): Date[] {
  const { hour, minute } = parseHhMm(settings.defaultPublishTime);
  const days = settings.publishDays.length ? [...new Set(settings.publishDays)].sort() : [1, 3, 5];
  const out: Date[] = [];

  // Start a day early so today's slot is not skipped when `from` is before it.
  const cursor = new Date(from.getTime() - 86_400_000);
  for (let i = 0; i < 400 && out.length < count; i += 1) {
    const day = new Date(cursor.getTime() + i * 86_400_000);
    const local = toZonedParts(day, settings.timezone);
    if (!days.includes(local.weekday)) continue;
    const instant = zonedTimeToUtc(local.year, local.month, local.day, hour, minute, settings.timezone);
    if (instant.getTime() < from.getTime()) continue;
    out.push(instant);
  }
  return out;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function describeDays(days: number[]): string {
  if (days.length === 0) return 'unscheduled';
  return days
    .slice()
    .sort()
    .map((d) => DAY_NAMES[d] ?? `day ${d}`)
    .join('/');
}
