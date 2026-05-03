import {
  pino,
  stdSerializers,
  type Logger,
  type LoggerOptions,
  type DestinationStream,
  type LevelWithSilent,
} from "pino";

export type Service = "lambda" | "bot";

export interface CreateLoggerOptions {
  level?: LevelWithSilent;
  destination?: DestinationStream;
}

export function createLogger(
  service: Service,
  opts: CreateLoggerOptions = {}
): Logger {
  const level =
    opts.level ??
    (process.env.LOG_LEVEL as LevelWithSilent | undefined) ??
    "info";

  const baseOptions: LoggerOptions = {
    level,
    base: { service },
    serializers: stdSerializers,
    formatters: {
      // Drop pino's default `pid` and `hostname` — they add noise on Vercel.
      bindings: (b) => ({ service: b.service }),
    },
  };

  return opts.destination
    ? pino(baseOptions, opts.destination)
    : pino(baseOptions);
}

export type { Logger } from "pino";
