/**
 * Scoped, level-gated logger.
 *
 * Every message is scrubbed of anything token-shaped before it is written, so
 * enabling verbose logging can never be the thing that leaks a credential into
 * the service worker console (which persists in chrome://extensions).
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const MIN_LEVEL: LogLevel =
  ((globalThis as { __DTL_DEBUG__?: string }).__DTL_DEBUG__ as LogLevel | undefined) ??
  'info';

/** `abcDEF123.xyz.456` → `abc***…***.456`. Also covers raw base64 JWT-ish blobs. */
const TOKEN_SHAPED = /\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{5,}(?:\.[A-Za-z0-9_-]+)?\b/g;
const LONG_OPAQUE = /\b[A-Za-z0-9_-]{40,}\b/g;

export function redact(input: string): string {
  return input
    .replace(TOKEN_SHAPED, (match) => {
      const segments = match.split('.');
      const head = segments[0] ?? '';
      const tail = segments[segments.length - 1] ?? '';
      return `${head.slice(0, 3)}***…***.${tail.slice(-3)}`;
    })
    .replace(LONG_OPAQUE, (match) => `${match.slice(0, 3)}***…***${match.slice(-3)}`);
}

function emit(level: LogLevel, scope: string, args: unknown[]): void {
  if (ORDER[level] < ORDER[MIN_LEVEL]) return;

  const prefix = `%c[dtl:${scope}]`;
  const style = `color:${level === 'error' ? '#f23f43' : level === 'warn' ? '#f0b232' : '#8b9bb4'};font-weight:600`;
  const safe = args.map((arg) => {
    if (typeof arg === 'string') return redact(arg);
    if (arg instanceof Error) return `${redact(arg.message)}`;
    return arg;
  });

  const sink =
    level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;

  sink(prefix, style, ...safe);
}

export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export function createLogger(scope: string): Logger {
  return {
    debug: (...args) => emit('debug', scope, args),
    info: (...args) => emit('info', scope, args),
    warn: (...args) => emit('warn', scope, args),
    error: (...args) => emit('error', scope, args),
  };
}
