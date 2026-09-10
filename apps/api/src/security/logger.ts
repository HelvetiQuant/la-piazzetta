/**
 * Logging strutturato e osservabilità.
 *
 * Logger JSON con livelli (debug/info/warn/error) che scrive su stdout in
 * formato strutturato (una riga JSON per evento) — pronto per un collector
 * (Loki/Cloudwatch/Datadog). In dev (NODE_ENV !== 'production') usa un
 * formato leggibile su console.
 *
 * Middleware Express:
 *  - `requestLogger`: logga ogni richiesta con metodo, path, status, durata,
 *    userId, venueId (se autenticato). Salta /health per non rumore.
 *  - `errorLogger`: logga gli errori 500 con stack trace.
 *
 * Nessuna dipendenza esterna: usa `console` con formattazione JSON.
 */

import type { Request, Response, NextFunction, RequestHandler, ErrorRequestHandler } from 'express';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 50 };

export interface LogContext {
  [key: string]: unknown;
}

export class Logger {
  private readonly minLevel: number;
  private readonly service: string;
  private readonly isProd: boolean;

  constructor(service = 'la-piazzetta-api', minLevel: LogLevel = 'info') {
    this.service = service;
    this.minLevel = LEVEL_PRIORITY[minLevel];
    this.isProd = process.env.NODE_ENV === 'production';
  }

  debug(msg: string, ctx: LogContext = {}): void {
    this.emit('debug', msg, ctx);
  }
  info(msg: string, ctx: LogContext = {}): void {
    this.emit('info', msg, ctx);
  }
  warn(msg: string, ctx: LogContext = {}): void {
    this.emit('warn', msg, ctx);
  }
  error(msg: string, ctx: LogContext = {}): void {
    this.emit('error', msg, ctx);
  }

  private emit(level: LogLevel, msg: string, ctx: LogContext): void {
    if (LEVEL_PRIORITY[level] < this.minLevel) return;
    const entry = {
      ts: new Date().toISOString(),
      level,
      service: this.service,
      msg,
      ...ctx,
    };
    if (this.isProd) {
      // JSON su una riga per il collector
      const line = JSON.stringify(entry);
      if (level === 'error') console.error(line);
      else if (level === 'warn') console.warn(line);
      else console.log(line);
    } else {
      // formato leggibile in dev
      const ctxStr = Object.keys(ctx).length > 0 ? ' ' + JSON.stringify(ctx) : '';
      const prefix = `[${entry.ts.slice(11, 23)}] ${level.toUpperCase()}`;
      const line = `${prefix} ${msg}${ctxStr}`;
      if (level === 'error') console.error(line);
      else if (level === 'warn') console.warn(line);
      else console.log(line);
    }
  }
}

/** Logger singleton. */
let shared: Logger | null = null;
export function getLogger(): Logger {
  if (!shared) {
    const minLevel = (process.env.LOG_LEVEL as LogLevel) || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
    shared = new Logger('la-piazzetta-api', minLevel);
  }
  return shared;
}

/**
 * Middleware di request logging: logga ogni richiesta HTTP con durata e
 * status. Salta /health e /ws (rumore inutile). Inietta `(req as any).logStart` per
 * calcolare la durata.
 */
export function requestLogger(log: Logger = getLogger()): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/api/v1/health' || req.path.startsWith('/ws')) {
      next();
      return;
    }
    const start = Date.now();
    (req as any).logStart = start;

    res.on('finish', () => {
      const durationMs = Date.now() - start;
      const user = (req as any).devUser;
      const ctx: LogContext = {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs,
        ...(user ? { userId: user.userId, venueId: user.venueId } : {}),
      };
      if (res.statusCode >= 500) {
        log.error('request', ctx);
      } else if (res.statusCode >= 400) {
        log.warn('request', ctx);
      } else {
        log.info('request', ctx);
      }
    });

    next();
  };
}

/**
 * Middleware di error logging: cattura errori non gestiti prima dell'handler.
 * Logga a livello `error` solo gli errori non-classificati (veri 500); gli
 * errori applicativi attesi (ZodError, PrismaClientKnownRequestError,
 * AuthError, HttpError con status < 500) sono degradati a `warn` per non
 * rumoreare l'osservabilità con errori client (400/401/403/404/409).
 */
export function errorLogger(log: Logger = getLogger()): ErrorRequestHandler {
  return (err: unknown, _req: Request, _res: Response, next: NextFunction) => {
    const e = err as { name?: string; code?: string; status?: number; message?: string; stack?: string };
    const isClientError =
      e?.name === 'ZodError' ||
      e?.name === 'AuthError' ||
      e?.name === 'HttpError' ||
      (e?.code && typeof e.code === 'string' && e.code.startsWith('P')) || // Prisma
      (typeof e?.status === 'number' && e.status < 500);
    const level = isClientError ? 'warn' : 'error';
    log[level]('request-error', {
      error: e?.message ?? String(err),
      name: e?.name,
      ...(isClientError ? {} : { stack: e?.stack }),
    });
    next(err);
  };
}
