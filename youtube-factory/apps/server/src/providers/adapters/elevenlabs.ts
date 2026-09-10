import type { AppConfig } from '../../config/index.js';
import { ProviderError, ProviderNotConfiguredError } from '../../shared/errors.js';
import type { Capability } from '../../shared/types.js';
import { request } from '../http.js';
import { estimate } from '../rates.js';
import type {
  AIProvider,
  EstimateInput,
  OperationContext,
  ProviderHealth,
  VoiceCapable,
  VoiceRequest,
  VoiceResponse,
  WordTiming,
} from '../types.js';

/**
 * ElevenLabs text-to-speech, implemented against the vendor's published API definition:
 *
 *   POST {baseUrl}/v1/text-to-speech/{voice_id}/with-timestamps
 *     header: xi-api-key
 *     query:  output_format (e.g. mp3_44100_128)
 *     body:   { text, model_id, language_code?, voice_settings?, previous_text?,
 *               next_text?, seed?, apply_text_normalization? }
 *     200:    { audio_base64, alignment { characters, character_start_times_seconds,
 *               character_end_times_seconds }, normalized_alignment }
 *
 * The `with-timestamps` variant is used rather than plain synthesis because character
 * alignment is what makes word-accurate subtitles and scene timing possible (spec §21).
 */
export class ElevenLabsProvider implements AIProvider, VoiceCapable {
  readonly key = 'elevenlabs';
  readonly name = 'ElevenLabs';
  readonly capabilities: readonly Capability[] = ['generateVoice'];

  constructor(private readonly config: AppConfig) {}

  private get creds() {
    return this.config.providers.elevenlabs;
  }

  isConfigured(): boolean {
    return this.creds.key.present;
  }

  missingConfig(): string[] {
    return this.isConfigured() ? [] : ['ELEVENLABS_API_KEY'];
  }

  estimateCost(input: EstimateInput) {
    return estimate(this.key, input);
  }

  private headers(): Record<string, string> {
    if (!this.isConfigured()) throw new ProviderNotConfiguredError(this.key, this.missingConfig());
    return { 'xi-api-key': this.creds.key.reveal(), 'content-type': 'application/json' };
  }

  async health(): Promise<ProviderHealth> {
    if (!this.isConfigured()) return { ok: false, detail: 'No API key configured' };
    const started = Date.now();
    try {
      await request(this.key, `${this.creds.baseUrl}/v1/user/subscription`, {
        headers: this.headers(),
        method: 'GET',
        timeoutMs: 15_000,
      });
      return { ok: true, latencyMs: Date.now() - started };
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - started, detail: (err as Error).message };
    }
  }

  async listVoices(): Promise<Array<{ id: string; name: string; labels?: Record<string, string> }>> {
    const res = await request<{ voices?: Array<{ voice_id: string; name: string; labels?: Record<string, string> }> }>(
      this.key,
      `${this.creds.baseUrl}/v1/voices`,
      { headers: this.headers(), method: 'GET', timeoutMs: 30_000 },
    );
    return (res.data.voices ?? []).map((v) => ({ id: v.voice_id, name: v.name, labels: v.labels }));
  }

  async generateVoice(req: VoiceRequest, ctx: OperationContext = {}): Promise<VoiceResponse> {
    const voiceId = req.voiceId || this.creds.defaultVoiceId;
    if (!voiceId) {
      throw new ProviderError(this.key, 'No voice id supplied and ELEVENLABS_DEFAULT_VOICE_ID is not set', {
        retryable: false,
      });
    }
    const outputFormat = req.outputFormat ?? 'mp3_44100_128';

    const res = await request<TimestampResponse>(
      this.key,
      `${this.creds.baseUrl}/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps`,
      {
        headers: this.headers(),
        query: { output_format: outputFormat },
        body: {
          text: req.text,
          model_id: req.modelId ?? this.creds.model,
          ...(req.language ? { language_code: req.language } : {}),
          ...(req.previousText ? { previous_text: req.previousText } : {}),
          ...(req.nextText ? { next_text: req.nextText } : {}),
          voice_settings: {
            stability: req.settings?.stability ?? 0.5,
            similarity_boost: req.settings?.similarityBoost ?? 0.75,
            style: req.settings?.style ?? 0,
            speed: req.settings?.speed ?? 1,
            use_speaker_boost: req.settings?.useSpeakerBoost ?? true,
          },
        },
        timeoutMs: Math.max(this.config.limits.providerTimeoutMs, 180_000),
        signal: ctx.signal,
      },
    );

    if (!res.data.audio_base64) {
      throw new ProviderError(this.key, 'Response carried no audio', { retryable: true });
    }
    const audio = Buffer.from(res.data.audio_base64, 'base64');
    const alignment = res.data.alignment ?? res.data.normalized_alignment;
    const wordTimings = alignment ? charactersToWords(alignment) : [];
    const durationSec = alignment
      ? Math.max(...alignment.character_end_times_seconds, 0)
      : estimateAudioSeconds(req.text);

    return {
      audio,
      mimeType: outputFormat.startsWith('mp3') ? 'audio/mpeg' : 'audio/wav',
      durationSec,
      wordTimings,
      usage: {
        inputUnits: req.text.length,
        outputUnits: durationSec,
        unit: 'character',
        model: req.modelId ?? this.creds.model,
        cost: estimate(this.key, { capability: 'generateVoice', characters: req.text.length }),
      },
    };
  }
}

interface CharacterAlignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

interface TimestampResponse {
  audio_base64?: string;
  alignment?: CharacterAlignment;
  normalized_alignment?: CharacterAlignment;
}

/**
 * ElevenLabs reports timing per character; subtitles need it per word. Characters are
 * accumulated until a whitespace boundary, and each word inherits the start time of its
 * first character and the end time of its last.
 */
export function charactersToWords(alignment: CharacterAlignment): WordTiming[] {
  const { characters, character_start_times_seconds: starts, character_end_times_seconds: ends } = alignment;
  const words: WordTiming[] = [];
  let current = '';
  let start = 0;
  let end = 0;

  for (let i = 0; i < characters.length; i += 1) {
    const char = characters[i] ?? '';
    const isSpace = /\s/.test(char);
    if (!isSpace) {
      if (current === '') start = starts[i] ?? end;
      current += char;
      end = ends[i] ?? end;
    }
    if ((isSpace || i === characters.length - 1) && current !== '') {
      words.push({ word: current, start, end });
      current = '';
    }
  }
  return words;
}

function estimateAudioSeconds(text: string): number {
  // ~15 characters per second of natural narration — only used if alignment is absent.
  return Math.max(0.5, text.length / 15);
}
