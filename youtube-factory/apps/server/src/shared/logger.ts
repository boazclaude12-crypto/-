export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Fields that must never reach a log sink (spec §46). */
const REDACT = [
  'password',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'apikey',
  'api_key',
  'secret',
  'clientsecret',
  'client_secret',
  'authorization',
  'cookie',
  'ciphertext',
  'xi-api-key',
];

export interface LogContext {
  jobId?: string;
  videoId?: string;
  channelId?: string;
  userId?: string;
  provider?: string;
  agent?: string;
  [key: string]: unknown;
}

export interface Logger {
  child(ctx: LogContext): Logger;
  debug(msg: string, ctx?: LogContext): void;
  info(msg: string, ctx?: LogContext): void;
  warn(msg: string, ctx?: LogContext): void;
  error(msg: string, ctx?: LogContext): void;
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACT.includes(k.toLowerCase()) ? '[redacted]' : redact(v, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string' && value.length > 2000) return `${value.slice(0, 2000)}…`;
  return value;
}

class JsonLogger implements Logger {
  constructor(
    private readonly level: LogLevel,
    private readonly base: LogContext,
    private readonly sink: (line: string) => void,
  ) {}

  child(ctx: LogContext): Logger {
    return new JsonLogger(this.level, { ...this.base, ...ctx }, this.sink);
  }

  private write(level: LogLevel, msg: string, ctx?: LogContext) {
    if (LEVELS[level] < LEVELS[this.level]) return;
    const line = {
      ts: new Date().toISOString(),
      level,
      msg,
      ...(redact({ ...this.base, ...ctx }) as object),
    };
    this.sink(JSON.stringify(line));
  }

  debug(msg: string, ctx?: LogContext) { this.write('debug', msg, ctx); }
  info(msg: string, ctx?: LogContext) { this.write('info', msg, ctx); }
  warn(msg: string, ctx?: LogContext) { this.write('warn', msg, ctx); }
  error(msg: string, ctx?: LogContext) { this.write('error', msg, ctx); }
}

export function createLogger(level: LogLevel = 'info', base: LogContext = {}): Logger {
  return new JsonLogger(level, base, (line) => process.stdout.write(`${line}\n`));
}

/** Collects lines instead of printing — used by tests and the admin log viewer. */
export class MemoryLogger implements Logger {
  readonly lines: string[] = [];
  constructor(private readonly base: LogContext = {}) {}
  child(ctx: LogContext): Logger {
    const c = new MemoryLogger({ ...this.base, ...ctx });
    (c as { lines: string[] }).lines = this.lines;
    return c;
  }
  private push(level: LogLevel, msg: string, ctx?: LogContext) {
    this.lines.push(JSON.stringify({ level, msg, ...(redact({ ...this.base, ...ctx }) as object) }));
  }
  debug(m: string, c?: LogContext) { this.push('debug', m, c); }
  info(m: string, c?: LogContext) { this.push('info', m, c); }
  warn(m: string, c?: LogContext) { this.push('warn', m, c); }
  error(m: string, c?: LogContext) { this.push('error', m, c); }
}

export const nullLogger: Logger = {
  child: () => nullLogger,
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};
