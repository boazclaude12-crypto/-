import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { DEFAULT_IDEA_WEIGHTS, factConfidence, scoreIdea, scoreQuality } from '../shared/scoring.js';
import { countWords, estimateDurationSec, ngramOverlap, wordBudget } from '../shared/text.js';
import { formatChapter, formatTimecode, parseHhMm, toZonedParts, zonedTimeToUtc } from '../shared/time.js';
import {
  AesGcmEncryptor,
  hashPassword,
  newSessionToken,
  sha256,
  signPayload,
  SecretString,
  verifyPassword,
  verifySignature,
} from '../shared/crypto.js';
import { zodToJsonSchema } from '../shared/json-schema.js';
import { backoffDelay, CircuitBreaker, withRetry } from '../shared/retry.js';
import { FixedClock } from '../shared/clock.js';
import { redact } from '../shared/logger.js';
import { VideoStateMachine } from '../pipeline/state-machine.js';
import { computeSlots } from '../services/scheduler.js';
import { applyPricingOverrides, estimate, type RateCard } from '../providers/rates.js';
import { charactersToWords } from '../providers/adapters/elevenlabs.js';
import { parseIsoDuration } from '../providers/adapters/youtube.js';
import { buildCues, buildChapters, locateBlocks, toSrt, toVtt, shiftTimings } from '../media/captions.js';
import { buildTimeline, fitScenesToNarration } from '../media/timeline.js';
import { chooseDuration } from '../services/production.js';
import { dedupe, parseFeed } from '../services/discovery.js';
import { promptChecksum } from '../services/cost.js';
import { render } from '../agents/prompts/library.js';
import type { ChannelSettingsRecord, ContentIdeaRecord } from '../db/types.js';

describe('idea scoring', () => {
  const scores = {
    estimatedDemand: 92,
    competition: 61,
    novelty: 70,
    evergreenScore: 80,
    trendScore: 88,
    estimatedCtr: 84,
    estimatedRetention: 76,
  };

  it('applies the specification formula', () => {
    const result = scoreIdea(scores, DEFAULT_IDEA_WEIGHTS);
    const expected =
      92 * 0.25 + 88 * 0.2 + 84 * 0.2 + 76 * 0.15 + 70 * 0.1 + 80 * 0.1;
    expect(result.overall).toBeCloseTo(expected, 1);
  });

  it('rewards low competition when the weight is used', () => {
    const low = scoreIdea({ ...scores, competition: 10 }, { competition: 0.3 });
    const high = scoreIdea({ ...scores, competition: 95 }, { competition: 0.3 });
    expect(low.overall).toBeGreaterThan(high.overall);
  });

  it('normalises weights that do not sum to one', () => {
    const result = scoreIdea(scores, { demand: 10, trend: 10, ctr: 10, retention: 10, novelty: 10, evergreen: 10, competition: 10 });
    expect(result.overall).toBeGreaterThan(0);
    expect(result.overall).toBeLessThanOrEqual(100);
    expect(Object.values(result.weights).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });

  it('never leaves the 0-100 range', () => {
    const zero = scoreIdea({
      estimatedDemand: 0, competition: 100, novelty: 0, evergreenScore: 0,
      trendScore: 0, estimatedCtr: 0, estimatedRetention: 0,
    });
    expect(zero.overall).toBeGreaterThanOrEqual(0);
    const max = scoreIdea({
      estimatedDemand: 100, competition: 0, novelty: 100, evergreenScore: 100,
      trendScore: 100, estimatedCtr: 100, estimatedRetention: 100,
    });
    expect(max.overall).toBeLessThanOrEqual(100);
  });
});

describe('quality and fact confidence', () => {
  it('re-normalises when dimensions are missing', () => {
    const partial = scoreQuality({ research: 90, script: 80 });
    expect(partial.overall).toBeGreaterThan(79);
    expect(partial.overall).toBeLessThan(91);
    expect(partial.parts.thumbnail).toBeUndefined();
  });

  it('matches the worked example from the specification', () => {
    const result = scoreQuality({
      research: 91, script: 87, hook: 94, visual: 82, audio: 96, thumbnail: 90, seo: 84,
    });
    expect(result.overall).toBeGreaterThan(85);
    expect(result.overall).toBeLessThan(93);
  });

  it('penalises contradicted claims rather than averaging them away', () => {
    const supported = factConfidence([{ verdict: 'SUPPORTED', confidence: 0.9 }, { verdict: 'SUPPORTED', confidence: 0.9 }]);
    const mixed = factConfidence([{ verdict: 'SUPPORTED', confidence: 0.9 }, { verdict: 'CONTRADICTED', confidence: 0.9 }]);
    const unverified = factConfidence([{ verdict: 'UNVERIFIED', confidence: 0.9 }]);
    expect(supported).toBeGreaterThan(0.85);
    expect(mixed).toBeLessThan(supported);
    expect(unverified).toBeLessThan(0.4);
    expect(factConfidence([])).toBe(0);
  });
});

describe('narration timing', () => {
  it('derives a word budget from the target runtime', () => {
    const budget = wordBudget(8 * 60, 'en');
    // The specification's example: 8 minutes ≈ 1,000-1,300 words.
    expect(budget.target).toBeGreaterThan(1000);
    expect(budget.target).toBeLessThan(1300);
    expect(budget.min).toBeLessThan(budget.target);
    expect(budget.max).toBeGreaterThan(budget.target);
  });

  it('uses a different rate per language', () => {
    expect(wordBudget(600, 'he').target).toBeLessThan(wordBudget(600, 'en').target);
  });

  it('counts characters rather than words for CJK', () => {
    expect(countWords('これはテストです', 'ja')).toBe(8);
    expect(countWords("it's a test, isn't it", 'en')).toBe(5);
  });

  it('estimates duration from word count', () => {
    const text = Array.from({ length: 145 }, () => 'word').join(' ');
    expect(estimateDurationSec(text, 'en')).toBeCloseTo(60, 0);
  });
});

describe('originality check', () => {
  it('detects near-verbatim reuse and ignores shared vocabulary', () => {
    const source = 'The treaty was signed in the winter of nineteen nineteen after months of argument between the delegations';
    expect(ngramOverlap(source, source, 8)).toBe(1);
    const original = 'Delegates argued through the winter before anyone put a signature on the document at all';
    expect(ngramOverlap(original, source, 8)).toBeLessThan(0.2);
  });
});

describe('time formatting and timezones', () => {
  it('formats timecodes and chapters', () => {
    expect(formatTimecode(3661.5, true)).toBe('01:01:01,500');
    expect(formatChapter(75)).toBe('01:15');
    expect(formatChapter(3675)).toBe('1:01:15');
    expect(formatChapter(0)).toBe('00:00');
  });

  it('parses HH:MM and rejects nonsense', () => {
    expect(parseHhMm('18:30')).toEqual({ hour: 18, minute: 30 });
    expect(() => parseHhMm('25:00')).toThrow();
    expect(() => parseHhMm('not a time')).toThrow();
  });

  it('converts wall-clock time to UTC across a DST boundary', () => {
    // Berlin is UTC+1 in January and UTC+2 in July; 18:00 local must map to both.
    const winter = zonedTimeToUtc(2026, 1, 15, 18, 0, 'Europe/Berlin');
    const summer = zonedTimeToUtc(2026, 7, 15, 18, 0, 'Europe/Berlin');
    expect(winter.toISOString()).toBe('2026-01-15T17:00:00.000Z');
    expect(summer.toISOString()).toBe('2026-07-15T16:00:00.000Z');
  });

  it('reads zoned parts back consistently', () => {
    const parts = toZonedParts(new Date('2026-07-15T16:00:00.000Z'), 'Europe/Berlin');
    expect(parts).toMatchObject({ year: 2026, month: 7, day: 15, hour: 18, minute: 0 });
  });
});

describe('scheduling slots', () => {
  const settings = {
    channelId: 'c1',
    timezone: 'Europe/Berlin',
    defaultPublishTime: '18:00',
    publishDays: [1, 3, 5],
  } as ChannelSettingsRecord;

  it('produces the configured days at the configured local time', () => {
    const slots = computeSlots(settings, new Date('2026-01-05T00:00:00Z'), 3);
    expect(slots).toHaveLength(3);
    for (const slot of slots) {
      const parts = toZonedParts(slot, 'Europe/Berlin');
      expect(parts.hour).toBe(18);
      expect([1, 3, 5]).toContain(parts.weekday);
    }
    expect(slots[0]!.getTime()).toBeLessThan(slots[1]!.getTime());
  });

  it('never returns a slot before the requested start', () => {
    const from = new Date('2026-01-05T18:30:00Z');
    for (const slot of computeSlots(settings, from, 4)) {
      expect(slot.getTime()).toBeGreaterThanOrEqual(from.getTime());
    }
  });

  it('keeps the local hour stable across the DST change', () => {
    const slots = computeSlots(settings, new Date('2026-03-25T00:00:00Z'), 6);
    for (const slot of slots) expect(toZonedParts(slot, 'Europe/Berlin').hour).toBe(18);
  });
});

describe('security primitives', () => {
  it('hashes and verifies passwords, rejecting the wrong one', () => {
    const hash = hashPassword('correct horse battery staple');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(verifyPassword('correct horse battery staple', hash)).toBe(true);
    expect(verifyPassword('wrong password', hash)).toBe(false);
    expect(verifyPassword('x', 'not-a-hash')).toBe(false);
  });

  it('produces a different hash for the same password', () => {
    expect(hashPassword('same')).not.toBe(hashPassword('same'));
  });

  it('stores only the hash of a session token', () => {
    const { token, hash } = newSessionToken();
    expect(hash).toBe(sha256(token));
    expect(hash).not.toContain(token);
  });

  it('round-trips AES-256-GCM and rejects tampering', () => {
    const enc = new AesGcmEncryptor(AesGcmEncryptor.generateKey());
    const cipher = enc.encrypt('ya29.super-secret-refresh-token');
    expect(cipher).not.toContain('ya29');
    expect(enc.decrypt(cipher)).toBe('ya29.super-secret-refresh-token');

    const parts = cipher.split('.');
    const tampered = `${parts[0]}.${parts[1]}.${parts[2]}.${Buffer.from('evil').toString('base64url')}`;
    expect(() => enc.decrypt(tampered)).toThrow();
    expect(() => new AesGcmEncryptor('too-short')).toThrow();
  });

  it('verifies webhook signatures and rejects replays', () => {
    const now = Date.now();
    const ts = Math.floor(now / 1000);
    const sig = signPayload('secret', '{"a":1}', ts);
    expect(verifySignature('secret', '{"a":1}', ts, sig, 300, now)).toBe(true);
    expect(verifySignature('secret', '{"a":2}', ts, sig, 300, now)).toBe(false);
    expect(verifySignature('other', '{"a":1}', ts, sig, 300, now)).toBe(false);
    expect(verifySignature('secret', '{"a":1}', ts - 1000, sig, 300, now)).toBe(false);
  });

  it('keeps secrets out of strings, JSON and logs', () => {
    const secret = new SecretString('sk-live-abcdef123456');
    expect(`${secret}`).toBe('[secret]');
    expect(JSON.stringify({ key: secret })).toBe('{"key":"[secret]"}');
    expect(secret.hint()).toBe('••••3456');
    expect(secret.reveal()).toBe('sk-live-abcdef123456');

    const line = JSON.stringify(redact({ apiKey: 'sk-live-x', nested: { refreshToken: 'ya29.x', safe: 'ok' } }));
    expect(line).not.toContain('sk-live-x');
    expect(line).not.toContain('ya29.x');
    expect(line).toContain('ok');
  });
});

describe('zod to JSON Schema', () => {
  it('converts the constructs agent schemas use', () => {
    const schema = z.object({
      title: z.string().min(3).max(80),
      score: z.number().min(0).max(100),
      count: z.number().int(),
      kind: z.enum(['a', 'b']),
      flag: z.boolean(),
      items: z.array(z.object({ name: z.string() })).min(2),
      optional: z.string().optional(),
      withDefault: z.number().default(3),
    });
    const json = zodToJsonSchema(schema);
    expect(json.type).toBe('object');
    expect(json.required).toEqual(['title', 'score', 'count', 'kind', 'flag', 'items']);
    expect(json.properties?.title).toMatchObject({ type: 'string', minLength: 3, maxLength: 80 });
    expect(json.properties?.count).toMatchObject({ type: 'integer' });
    expect(json.properties?.kind).toMatchObject({ enum: ['a', 'b'] });
    expect(json.properties?.items).toMatchObject({ type: 'array', minItems: 2 });
    expect(json.additionalProperties).toBe(false);
  });

  it('marks optionals nullable in strict mode', () => {
    const json = zodToJsonSchema(z.object({ a: z.string(), b: z.string().optional() }), { strict: true });
    expect(json.required).toEqual(['a', 'b']);
    expect(json.properties?.b?.type).toEqual(['string', 'null']);
  });
});

describe('retry and circuit breaking', () => {
  it('retries then succeeds', async () => {
    const clock = new FixedClock();
    let calls = 0;
    const value = await withRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw Object.assign(new Error('flaky'), { code: 'ETIMEDOUT' });
        return 'ok';
      },
      { attempts: 5, jitter: () => 0 },
      clock,
    );
    expect(value).toBe('ok');
    expect(calls).toBe(3);
  });

  it('stops immediately on a non-retryable error', async () => {
    const clock = new FixedClock();
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw new Error('permanent');
        },
        { attempts: 5, shouldRetry: () => false },
        clock,
      ),
    ).rejects.toThrow('permanent');
    expect(calls).toBe(1);
  });

  it('grows the backoff and stays inside the ceiling', () => {
    expect(backoffDelay(1, 1000, 60_000, () => 1)).toBe(1000);
    expect(backoffDelay(3, 1000, 60_000, () => 1)).toBe(4000);
    expect(backoffDelay(20, 1000, 60_000, () => 1)).toBe(60_000);
    expect(backoffDelay(3, 1000, 60_000, () => 0)).toBe(2000);
  });

  it('opens after repeated failures and closes after the cooldown', () => {
    const breaker = new CircuitBreaker(3, 60_000, 120_000);
    const t = 1_000_000;
    breaker.recordFailure(t);
    breaker.recordFailure(t + 1);
    expect(breaker.isOpen(t + 2)).toBe(false);
    breaker.recordFailure(t + 2);
    expect(breaker.isOpen(t + 3)).toBe(true);
    expect(breaker.isOpen(t + 130_000)).toBe(false);
  });

  it('closes on success', () => {
    const breaker = new CircuitBreaker(2, 60_000);
    breaker.recordFailure(1000);
    breaker.recordSuccess();
    breaker.recordFailure(2000);
    expect(breaker.isOpen(2001)).toBe(false);
  });
});

describe('video state machine', () => {
  it('permits the documented happy path', () => {
    const path = [
      'IDEA', 'RESEARCHING', 'RESEARCH_COMPLETE', 'SCRIPTING', 'SCRIPT_READY', 'FACT_CHECK',
      'SCENE_PLANNING', 'GENERATING_VISUALS', 'GENERATING_VOICE', 'EDITING', 'QC',
      'THUMBNAIL', 'SEO', 'READY', 'SCHEDULED', 'PUBLISHED',
    ] as const;
    for (let i = 0; i < path.length - 1; i += 1) {
      expect(VideoStateMachine.canTransition(path[i]!, path[i + 1]!)).toBe(true);
    }
  });

  it('rejects jumps that would skip production', () => {
    expect(VideoStateMachine.canTransition('IDEA', 'PUBLISHED')).toBe(false);
    expect(VideoStateMachine.canTransition('SCRIPT_READY', 'READY')).toBe(false);
    expect(() => VideoStateMachine.assert('IDEA', 'SCHEDULED')).toThrow(/Illegal video state transition/);
  });

  it('allows QC to send work back and failures to be retried', () => {
    expect(VideoStateMachine.canTransition('QC', 'GENERATING_VISUALS')).toBe(true);
    expect(VideoStateMachine.canTransition('FACT_CHECK', 'RESEARCH_COMPLETE')).toBe(true);
    expect(VideoStateMachine.canTransition('FAILED', 'EDITING')).toBe(true);
  });

  it('reports monotonic completion', () => {
    expect(VideoStateMachine.completion('IDEA')).toBe(0);
    expect(VideoStateMachine.completion('EDITING')).toBeGreaterThan(VideoStateMachine.completion('SCRIPTING'));
    expect(VideoStateMachine.completion('ANALYZING')).toBe(100);
    expect(VideoStateMachine.completion('FAILED')).toBe(0);
  });
});

describe('provider rate card', () => {
  it('prices tokens, images, video and speech', () => {
    expect(estimate('anthropic', { capability: 'generateText', inputTokens: 1_000_000, outputTokens: 0 }).usd).toBeCloseTo(3, 5);
    expect(estimate('anthropic', { capability: 'generateText', inputTokens: 0, outputTokens: 1_000_000 }, 'fast').usd).toBeCloseTo(5, 5);
    expect(estimate('higgsfield', { capability: 'generateVideo', seconds: 10, quality: 'standard' }).usd).toBeCloseTo(1.2, 5);
    expect(estimate('elevenlabs', { capability: 'generateVoice', characters: 1000 }).usd).toBeCloseTo(0.18, 5);
    expect(estimate('mock', { capability: 'generateImage', images: 4 }).usd).toBe(0);
    expect(estimate('unknown-provider', { capability: 'generateImage', images: 4 }).usd).toBe(0);
  });

  it('makes the cheap tier cheaper', () => {
    const premium = estimate('higgsfield', { capability: 'generateVideo', seconds: 10, quality: 'premium' }).usd;
    const draft = estimate('higgsfield', { capability: 'generateVideo', seconds: 10, quality: 'draft' }).usd;
    expect(draft).toBeLessThan(premium);
  });
});

describe('pricing overrides', () => {
  /** A throwaway card, so these never mutate the module-level RATE_CARD other tests read. */
  const card = (): Record<string, RateCard> => ({
    higgsfield: { videoPerSecond: { draft: 0.06, standard: 0.12, premium: 0.24 }, image: { standard: 0.03 } },
    elevenlabs: { voicePerThousandChars: 0.18 },
  });

  it('replaces only the tiers named, leaving the rest of the table intact', () => {
    const c = card();
    applyPricingOverrides('{"higgsfield":{"videoPerSecond":{"standard":0.15}}}', c);
    expect(c.higgsfield?.videoPerSecond).toEqual({ draft: 0.06, standard: 0.15, premium: 0.24 });
    // A partial override must not wipe the sibling fields on the same provider.
    expect(c.higgsfield?.image).toEqual({ standard: 0.03 });
  });

  it('overrides a scalar rate', () => {
    const c = card();
    applyPricingOverrides('{"elevenlabs":{"voicePerThousandChars":0.3}}', c);
    expect(c.elevenlabs?.voicePerThousandChars).toBe(0.3);
  });

  it('prices a provider the built-in card has never heard of', () => {
    const c = card();
    applyPricingOverrides('{"newvendor":{"image":{"standard":0.07}}}', c);
    expect(c.newvendor?.image?.standard).toBe(0.07);
  });

  it('does nothing when unset or blank', () => {
    const c = card();
    applyPricingOverrides(undefined, c);
    applyPricingOverrides('   ', c);
    expect(c).toEqual(card());
  });

  it('throws rather than ignoring a malformed override', () => {
    // Silently swallowing these is the dangerous branch: the operator would believe the
    // correction had applied while the budget guard kept using the old number.
    expect(() => applyPricingOverrides('{not json', card())).toThrow(/not valid JSON/);
    expect(() => applyPricingOverrides('[1,2]', card())).toThrow(/keyed by provider/);
    expect(() => applyPricingOverrides('{"higgsfield":5}', card())).toThrow(/must be an object/);
    expect(() => applyPricingOverrides('{"higgsfield":{"image":"cheap"}}', card())).toThrow(
      /must be a number or an object/,
    );
  });
});

describe('vendor response parsing', () => {
  it('turns ElevenLabs character alignment into word timings', () => {
    const words = charactersToWords({
      characters: ['H', 'i', ' ', 't', 'h', 'e', 'r', 'e'],
      character_start_times_seconds: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7],
      character_end_times_seconds: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
    });
    expect(words).toEqual([
      { word: 'Hi', start: 0, end: 0.2 },
      { word: 'there', start: 0.3, end: 0.8 },
    ]);
  });

  it('parses ISO 8601 durations from the YouTube API', () => {
    expect(parseIsoDuration('PT1H2M3S')).toBe(3723);
    expect(parseIsoDuration('PT45S')).toBe(45);
    expect(parseIsoDuration('PT12M')).toBe(720);
    expect(parseIsoDuration(undefined)).toBeUndefined();
    expect(parseIsoDuration('nonsense')).toBeUndefined();
  });
});

describe('captions and chapters', () => {
  const words = [
    { word: 'This', start: 0, end: 0.4 },
    { word: 'is', start: 0.4, end: 0.6 },
    { word: 'one.', start: 0.6, end: 1.0 },
    { word: 'And', start: 1.2, end: 1.4 },
    { word: 'this', start: 1.4, end: 1.7 },
    { word: 'is', start: 1.7, end: 1.9 },
    { word: 'two.', start: 1.9, end: 2.4 },
  ];

  it('breaks cues at sentence boundaries', () => {
    const cues = buildCues(words);
    expect(cues).toHaveLength(2);
    expect(cues[0]!.text).toBe('This is one.');
    expect(cues[1]!.start).toBe(1.2);
  });

  it('emits valid SRT and WebVTT', () => {
    const srt = toSrt(buildCues(words));
    expect(srt).toContain('1\n00:00:00,000 --> 00:00:01,000\nThis is one.');
    const vtt = toVtt(buildCues(words));
    expect(vtt.startsWith('WEBVTT')).toBe(true);
    expect(vtt).toContain('00:00:00.000 --> 00:00:01.000');
  });

  it('shifts segment timings onto the master timeline', () => {
    expect(shiftTimings([{ word: 'a', start: 1, end: 2 }], 10)).toEqual([{ word: 'a', start: 11, end: 12 }]);
  });

  it('locates section starts from real word timings', () => {
    const located = locateBlocks(
      [{ title: 'Intro', text: 'This is one.' }, { title: 'Body', text: 'And this is two.' }],
      words,
    );
    expect(located).toEqual([
      { title: 'Intro', startSec: 0 },
      { title: 'Body', startSec: 1.2 },
    ]);
  });

  it('applies YouTube chapter rules', () => {
    const chapters = buildChapters(
      [{ title: 'A', startSec: 12 }, { title: 'B', startSec: 90 }, { title: 'C', startSec: 200 }],
      600,
    );
    expect(chapters[0]!.startSec).toBe(0);
    expect(chapters).toHaveLength(3);

    // Fewer than three valid chapters is not a valid list.
    expect(buildChapters([{ title: 'A', startSec: 0 }, { title: 'B', startSec: 5 }], 600)).toEqual([]);
  });
});

describe('timeline construction', () => {
  const scenes = [
    { index: 0, durationSec: 6, path: '/a.png', kind: 'image' as const },
    { index: 1, durationSec: 4, path: '/b.mp4', kind: 'video' as const },
    { index: 2, durationSec: 5, path: '/c.png', kind: 'image' as const, textOverlay: 'Hello' },
  ];

  it('keeps scenes contiguous and totals the duration', () => {
    const timeline = buildTimeline({
      width: 1920, height: 1080, fps: 30, scenes,
      voiceover: [{ index: 0, path: '/vo.m4a', durationSec: 15 }],
    });
    for (let i = 1; i < timeline.scenes.length; i += 1) {
      const previous = timeline.scenes[i - 1]!;
      expect(timeline.scenes[i]!.startSec).toBeCloseTo(previous.startSec + previous.durationSec, 3);
    }
    const total = timeline.scenes.reduce((sum, s) => sum + s.durationSec, 0);
    expect(timeline.durationSec).toBeCloseTo(total, 2);
  });

  it('fits scene durations to the narration', () => {
    const timeline = buildTimeline({
      width: 1920, height: 1080, fps: 30, scenes,
      voiceover: [{ index: 0, path: '/vo.m4a', durationSec: 60 }],
    });
    // 15s of planned scenes stretched to cover 60s of narration, not left as 15s.
    expect(timeline.durationSec).toBeGreaterThan(55);
    expect(timeline.durationSec).toBeLessThan(70);
  });

  it('scales down when the shot list overruns the narration', () => {
    const fitted = fitScenesToNarration(scenes, 6);
    const total = fitted.reduce((sum, s) => sum + s.durationSec, 0);
    expect(total).toBeCloseTo(7.5, 1);
    for (const scene of fitted) expect(scene.durationSec).toBeGreaterThanOrEqual(2);
  });

  it('gives stills Ken Burns motion and leaves clips alone', () => {
    const timeline = buildTimeline({
      width: 1920, height: 1080, fps: 30, scenes,
      voiceover: [{ index: 0, path: '/vo.m4a', durationSec: 15 }],
    });
    expect(timeline.scenes[0]!.kenBurns?.enabled).toBe(true);
    expect(timeline.scenes[1]!.kenBurns).toBeUndefined();
  });

  it('places scene overlays on their own scene and never past the end', () => {
    const timeline = buildTimeline({
      width: 1920, height: 1080, fps: 30, scenes,
      voiceover: [{ index: 0, path: '/vo.m4a', durationSec: 15 }],
      overlays: [{ text: 'Late', startSec: 9999, durationSec: 3, position: 'top' }],
    });
    expect(timeline.overlays.some((o) => o.text === 'Hello')).toBe(true);
    expect(timeline.overlays.some((o) => o.text === 'Late')).toBe(false);
    for (const overlay of timeline.overlays) {
      expect(overlay.startSec + overlay.durationSec).toBeLessThanOrEqual(timeline.durationSec + 0.01);
    }
  });
});

describe('runtime policy', () => {
  const settings = { targetDurationMin: 10 } as ChannelSettingsRecord;
  const idea = (over: Partial<ContentIdeaRecord>) =>
    ({ estimatedDemand: 60, evergreenScore: 60, novelty: 60, estimatedRetention: 60, ...over }) as ContentIdeaRecord;

  it('shortens thin topics and lengthens deep ones', () => {
    const thin = chooseDuration(idea({ estimatedDemand: 30, evergreenScore: 30, novelty: 30 }), settings);
    const deep = chooseDuration(idea({ estimatedDemand: 90, evergreenScore: 90, novelty: 90, estimatedRetention: 85 }), settings);
    expect(thin).toBeLessThan(10 * 60);
    expect(deep).toBeGreaterThan(10 * 60);
  });

  it('stays within sane bounds', () => {
    const tiny = chooseDuration(idea({ estimatedDemand: 0, evergreenScore: 0, novelty: 0 }), { targetDurationMin: 1 } as ChannelSettingsRecord);
    expect(tiny).toBeGreaterThanOrEqual(240);
    const huge = chooseDuration(idea({ estimatedDemand: 100, evergreenScore: 100, novelty: 100, estimatedRetention: 100 }), { targetDurationMin: 90 } as ChannelSettingsRecord);
    expect(huge).toBeLessThanOrEqual(3600);
  });
});

describe('discovery helpers', () => {
  it('parses RSS and Atom feeds', () => {
    const rss = `<rss><channel>
      <item><title><![CDATA[First &amp; best]]></title><link>https://example.org/1</link><pubDate>Mon, 05 Jan 2026 10:00:00 GMT</pubDate></item>
      <item><title>Second</title><link>https://example.org/2</link></item>
    </channel></rss>`;
    const items = parseFeed(rss);
    expect(items).toHaveLength(2);
    expect(items[0]!.title).toBe('First & best');
    expect(items[0]!.link).toBe('https://example.org/1');

    const atom = `<feed><entry><title>Atom entry</title><link href="https://example.org/a"/><updated>2026-01-05</updated></entry></feed>`;
    expect(parseFeed(atom)[0]).toMatchObject({ title: 'Atom entry', link: 'https://example.org/a' });
  });

  it('merges duplicate topics keeping the strongest signal', () => {
    const merged = dedupe([
      { kind: 'RSS', topic: 'The Same Topic', score: 40 },
      { kind: 'YOUTUBE', topic: 'the same topic', score: 90 },
      { kind: 'REDDIT', topic: 'Another', score: 60 },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0]!.score).toBe(90);
  });
});

describe('prompt rendering', () => {
  it('substitutes variables and renders structures as JSON', () => {
    expect(render('Hello {{name}}, you are {{age}}', { name: 'Ada', age: 36 })).toBe('Hello Ada, you are 36');
    expect(render('{{ nested.value }}', { nested: { value: 'deep' } })).toBe('deep');
    expect(render('{{missing}}!', {})).toBe('!');
    expect(render('{{list}}', { list: [1, 2] })).toContain('[\n  1,\n  2\n]');
  });
});

describe('asset reuse identity', () => {
  it('is stable per (video, prompt) and differs across either', () => {
    expect(promptChecksum('v1', 'a prompt')).toBe(promptChecksum('v1', 'a prompt'));
    expect(promptChecksum('v1', 'a prompt')).not.toBe(promptChecksum('v2', 'a prompt'));
    expect(promptChecksum('v1', 'a prompt')).not.toBe(promptChecksum('v1', 'other prompt'));
  });
});
