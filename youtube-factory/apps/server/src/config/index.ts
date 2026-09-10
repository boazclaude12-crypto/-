import { z } from 'zod';
import { SecretString } from '../shared/crypto.js';

/**
 * The single place `process.env` is read (spec §2, §74). Everything else takes a typed
 * config object. Missing provider credentials are not an error — they just mean that
 * provider reports `configured: false` and the registry routes around it (spec §81).
 */

const bool = (def = false) =>
  z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => {
      if (v === undefined || v === '') return def;
      if (typeof v === 'boolean') return v;
      return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
    });

const int = (def: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : Number(v)))
    .pipe(z.number().int());

const num = (def: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : Number(v)))
    .pipe(z.number());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  PORT: int(4000),
  HOST: z.string().default('0.0.0.0'),
  PUBLIC_APP_URL: z.string().default('http://localhost:3000'),
  PUBLIC_API_URL: z.string().default('http://localhost:4000'),

  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),

  /** 64 hex chars. Required in production; generated ephemerally in dev/test. */
  ENCRYPTION_KEY: z.string().optional(),
  SESSION_COOKIE_NAME: z.string().default('ycf_session'),
  SESSION_TTL_DAYS: int(30),
  WEBHOOK_SECRET: z.string().optional(),
  ALLOW_REGISTRATION: bool(true),

  // Storage
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./.storage'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: bool(true),
  S3_PUBLIC_BASE_URL: z.string().optional(),

  // Queue
  QUEUE_DRIVER: z.enum(['bullmq', 'memory']).default('bullmq'),
  QUEUE_CONCURRENCY: int(4),

  // Anthropic (https://docs.anthropic.com — POST /v1/messages)
  CLAUDE_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_BASE_URL: z.string().default('https://api.anthropic.com'),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-5'),
  ANTHROPIC_FAST_MODEL: z.string().default('claude-haiku-4-5'),

  // OpenAI
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().default('https://api.openai.com'),
  OPENAI_MODEL: z.string().default('gpt-4.1'),
  OPENAI_IMAGE_MODEL: z.string().default('gpt-image-1'),

  /**
   * Higgsfield. The vendor SDK reads HF_CREDENTIALS ("KEY_ID:KEY_SECRET") or the
   * HF_API_KEY/HF_API_SECRET pair; HIGGSFIELD_API_KEY/SECRET are accepted as aliases.
   */
  HF_CREDENTIALS: z.string().optional(),
  HF_API_KEY: z.string().optional(),
  HF_API_SECRET: z.string().optional(),
  HIGGSFIELD_API_KEY: z.string().optional(),
  HIGGSFIELD_API_SECRET: z.string().optional(),
  HIGGSFIELD_BASE_URL: z.string().default('https://platform.higgsfield.ai'),
  HIGGSFIELD_VIDEO_MODEL: z.enum(['dop-lite', 'dop-turbo', 'dop-standard']).default('dop-turbo'),
  HIGGSFIELD_WEBHOOK_URL: z.string().optional(),

  // ElevenLabs
  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_BASE_URL: z.string().default('https://api.elevenlabs.io'),
  ELEVENLABS_MODEL: z.string().default('eleven_multilingual_v2'),
  ELEVENLABS_DEFAULT_VOICE_ID: z.string().optional(),

  // YouTube / Google OAuth
  YOUTUBE_CLIENT_ID: z.string().optional(),
  YOUTUBE_CLIENT_SECRET: z.string().optional(),
  YOUTUBE_REDIRECT_URI: z.string().default('http://localhost:4000/api/channels/oauth/callback'),
  YOUTUBE_API_KEY: z.string().optional(),

  // Discovery
  NEWS_API_KEY: z.string().optional(),
  REDDIT_CLIENT_ID: z.string().optional(),
  REDDIT_CLIENT_SECRET: z.string().optional(),
  REDDIT_USER_AGENT: z.string().default('youtube-content-factory/1.0'),

  // Notifications
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  DISCORD_WEBHOOK_URL: z.string().optional(),
  SLACK_WEBHOOK_URL: z.string().optional(),
  SMTP_URL: z.string().optional(),
  NOTIFY_FROM_EMAIL: z.string().default('factory@localhost'),

  // Media
  FFMPEG_PATH: z.string().default('ffmpeg'),
  FFPROBE_PATH: z.string().default('ffprobe'),
  RENDER_WIDTH: int(1920),
  RENDER_HEIGHT: int(1080),
  RENDER_FPS: int(30),
  RENDER_CRF: int(20),
  RENDER_PRESET: z.string().default('medium'),
  MEDIA_WORK_DIR: z.string().default('./.work'),

  // Guardrails
  DEFAULT_MONTHLY_BUDGET_USD: num(100),
  MAX_CONCURRENT_RENDERS: int(1),
  PROVIDER_TIMEOUT_MS: int(120_000),
  PROVIDER_MAX_ATTEMPTS: int(3),

  /** Forces every provider to its mock implementation, no network, no spend (spec §73). */
  OFFLINE_MODE: bool(false),
});

export type RawEnv = z.infer<typeof envSchema>;

export interface ProviderCredentials {
  anthropic: { key: SecretString; baseUrl: string; model: string; fastModel: string };
  openai: { key: SecretString; baseUrl: string; model: string; imageModel: string };
  higgsfield: {
    keyId: SecretString;
    keySecret: SecretString;
    baseUrl: string;
    videoModel: 'dop-lite' | 'dop-turbo' | 'dop-standard';
    webhookUrl?: string;
  };
  elevenlabs: { key: SecretString; baseUrl: string; model: string; defaultVoiceId?: string };
  youtube: {
    clientId: SecretString;
    clientSecret: SecretString;
    redirectUri: string;
    apiKey: SecretString;
  };
  newsApi: { key: SecretString };
  reddit: { clientId: SecretString; clientSecret: SecretString; userAgent: string };
  telegram: { token: SecretString; webhookSecret: SecretString };
}

export interface AppConfig {
  env: RawEnv['NODE_ENV'];
  isProduction: boolean;
  logLevel: RawEnv['LOG_LEVEL'];
  offline: boolean;
  http: { port: number; host: string; appUrl: string; apiUrl: string };
  security: {
    encryptionKey: string;
    sessionCookie: string;
    sessionTtlDays: number;
    webhookSecret: string;
    allowRegistration: boolean;
  };
  database: { url?: string };
  queue: { driver: 'bullmq' | 'memory'; redisUrl?: string; concurrency: number };
  storage: {
    driver: 'local' | 's3';
    localDir: string;
    s3?: {
      endpoint?: string;
      region: string;
      bucket: string;
      accessKey: string;
      secretKey: string;
      forcePathStyle: boolean;
      publicBaseUrl?: string;
    };
  };
  media: {
    ffmpegPath: string;
    ffprobePath: string;
    width: number;
    height: number;
    fps: number;
    crf: number;
    preset: string;
    workDir: string;
    maxConcurrentRenders: number;
  };
  providers: ProviderCredentials;
  notifications: {
    discordWebhookUrl?: string;
    slackWebhookUrl?: string;
    smtpUrl?: string;
    fromEmail: string;
  };
  limits: {
    defaultMonthlyBudgetUsd: number;
    providerTimeoutMs: number;
    providerMaxAttempts: number;
  };
}

const secret = (value?: string) => new SecretString(value ?? '');

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration — ${issues}`);
  }
  const env = parsed.data;
  const isProduction = env.NODE_ENV === 'production';

  const encryptionKey = env.ENCRYPTION_KEY ?? '';
  if (isProduction && encryptionKey.length !== 64) {
    throw new Error('ENCRYPTION_KEY (64 hex characters) is required in production');
  }
  if (isProduction && !env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required in production');
  }

  const hfPair = splitHiggsfieldCredentials(env);

  return {
    env: env.NODE_ENV,
    isProduction,
    logLevel: env.LOG_LEVEL,
    offline: env.OFFLINE_MODE,
    http: {
      port: env.PORT,
      host: env.HOST,
      appUrl: env.PUBLIC_APP_URL.replace(/\/$/, ''),
      apiUrl: env.PUBLIC_API_URL.replace(/\/$/, ''),
    },
    security: {
      // Dev and test fall back to an ephemeral key so nothing is silently persisted in clear.
      encryptionKey: encryptionKey.length === 64 ? encryptionKey : devKey(),
      sessionCookie: env.SESSION_COOKIE_NAME,
      sessionTtlDays: env.SESSION_TTL_DAYS,
      webhookSecret: env.WEBHOOK_SECRET ?? devKey().slice(0, 32),
      allowRegistration: env.ALLOW_REGISTRATION,
    },
    database: { url: env.DATABASE_URL },
    queue: {
      driver: env.QUEUE_DRIVER === 'bullmq' && env.REDIS_URL ? 'bullmq' : env.QUEUE_DRIVER === 'memory' ? 'memory' : 'memory',
      redisUrl: env.REDIS_URL,
      concurrency: env.QUEUE_CONCURRENCY,
    },
    storage: {
      driver: env.STORAGE_DRIVER === 's3' && env.S3_BUCKET ? 's3' : 'local',
      localDir: env.STORAGE_LOCAL_DIR,
      s3:
        env.S3_BUCKET && env.S3_ACCESS_KEY && env.S3_SECRET_KEY
          ? {
              endpoint: env.S3_ENDPOINT,
              region: env.S3_REGION,
              bucket: env.S3_BUCKET,
              accessKey: env.S3_ACCESS_KEY,
              secretKey: env.S3_SECRET_KEY,
              forcePathStyle: env.S3_FORCE_PATH_STYLE,
              publicBaseUrl: env.S3_PUBLIC_BASE_URL,
            }
          : undefined,
    },
    media: {
      ffmpegPath: env.FFMPEG_PATH,
      ffprobePath: env.FFPROBE_PATH,
      width: env.RENDER_WIDTH,
      height: env.RENDER_HEIGHT,
      fps: env.RENDER_FPS,
      crf: env.RENDER_CRF,
      preset: env.RENDER_PRESET,
      workDir: env.MEDIA_WORK_DIR,
      maxConcurrentRenders: env.MAX_CONCURRENT_RENDERS,
    },
    providers: {
      anthropic: {
        key: secret(env.CLAUDE_API_KEY ?? env.ANTHROPIC_API_KEY),
        baseUrl: env.ANTHROPIC_BASE_URL,
        model: env.ANTHROPIC_MODEL,
        fastModel: env.ANTHROPIC_FAST_MODEL,
      },
      openai: {
        key: secret(env.OPENAI_API_KEY),
        baseUrl: env.OPENAI_BASE_URL,
        model: env.OPENAI_MODEL,
        imageModel: env.OPENAI_IMAGE_MODEL,
      },
      higgsfield: {
        keyId: secret(hfPair.keyId),
        keySecret: secret(hfPair.keySecret),
        baseUrl: env.HIGGSFIELD_BASE_URL,
        videoModel: env.HIGGSFIELD_VIDEO_MODEL,
        webhookUrl: env.HIGGSFIELD_WEBHOOK_URL,
      },
      elevenlabs: {
        key: secret(env.ELEVENLABS_API_KEY),
        baseUrl: env.ELEVENLABS_BASE_URL,
        model: env.ELEVENLABS_MODEL,
        defaultVoiceId: env.ELEVENLABS_DEFAULT_VOICE_ID,
      },
      youtube: {
        clientId: secret(env.YOUTUBE_CLIENT_ID),
        clientSecret: secret(env.YOUTUBE_CLIENT_SECRET),
        redirectUri: env.YOUTUBE_REDIRECT_URI,
        apiKey: secret(env.YOUTUBE_API_KEY),
      },
      newsApi: { key: secret(env.NEWS_API_KEY) },
      reddit: {
        clientId: secret(env.REDDIT_CLIENT_ID),
        clientSecret: secret(env.REDDIT_CLIENT_SECRET),
        userAgent: env.REDDIT_USER_AGENT,
      },
      telegram: {
        token: secret(env.TELEGRAM_BOT_TOKEN),
        webhookSecret: secret(env.TELEGRAM_WEBHOOK_SECRET),
      },
    },
    notifications: {
      discordWebhookUrl: env.DISCORD_WEBHOOK_URL,
      slackWebhookUrl: env.SLACK_WEBHOOK_URL,
      smtpUrl: env.SMTP_URL,
      fromEmail: env.NOTIFY_FROM_EMAIL,
    },
    limits: {
      defaultMonthlyBudgetUsd: env.DEFAULT_MONTHLY_BUDGET_USD,
      providerTimeoutMs: env.PROVIDER_TIMEOUT_MS,
      providerMaxAttempts: env.PROVIDER_MAX_ATTEMPTS,
    },
  };
}

/**
 * Higgsfield accepts either a combined "KEY_ID:KEY_SECRET" string or a split pair; both
 * spellings from the vendor SDK are honoured, plus a HIGGSFIELD_* alias for readability.
 */
function splitHiggsfieldCredentials(env: RawEnv): { keyId?: string; keySecret?: string } {
  const combined = env.HF_CREDENTIALS;
  if (combined && combined.includes(':')) {
    const [keyId, keySecret] = combined.split(':');
    return { keyId, keySecret };
  }
  return {
    keyId: env.HF_API_KEY ?? env.HIGGSFIELD_API_KEY,
    keySecret: env.HF_API_SECRET ?? env.HIGGSFIELD_API_SECRET,
  };
}

let cachedDevKey: string | undefined;
function devKey(): string {
  if (!cachedDevKey) {
    // Ephemeral: restarting the process invalidates anything encrypted with it, which is
    // exactly what we want for a machine that has not been given a real key.
    cachedDevKey = Buffer.from(
      Array.from({ length: 32 }, () => Math.floor(Math.random() * 256)),
    ).toString('hex');
  }
  return cachedDevKey;
}

let cached: AppConfig | undefined;
export function config(): AppConfig {
  if (!cached) cached = loadConfig();
  return cached;
}
export function resetConfig(): void {
  cached = undefined;
}
