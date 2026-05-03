import { Axiom } from "@axiomhq/js";
import {
  pino,
  multistream,
  stdSerializers,
  type Logger,
  type LoggerOptions,
  type DestinationStream,
  type LevelWithSilent,
  type StreamEntry,
} from "pino";

export type Service = "lambda" | "bot";

export interface CreateLoggerOptions {
  level?: LevelWithSilent;
  destination?: DestinationStream;
}

// Singleton Axiom client — one per process. The client batches in-memory
// (every 1s or every 1000 events) and POSTs in the background, so we want
// to share the queue across every logger instance in the process.
let sharedAxiom: Axiom | null = null;

function getAxiomClient(token: string): Axiom {
  if (!sharedAxiom) {
    sharedAxiom = new Axiom({ token });
  }
  return sharedAxiom;
}

/**
 * Build a pino destination that forwards each log line to Axiom via HTTP.
 * Uses `pino.multistream` so we don't spawn a worker thread (worker threads
 * can be torn down before they flush on serverless platforms).
 */
function buildAxiomStream(token: string, dataset: string): DestinationStream {
  const axiom = getAxiomClient(token);
  return {
    write(line: string): void {
      try {
        const event = JSON.parse(line) as Record<string, unknown>;
        axiom.ingest(dataset, [event]);
      } catch {
        // Swallow ingest errors — never let observability take down the app.
        // Failures are visible via the Axiom client's onError handler.
      }
    },
  };
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

  // Test path: explicit destination always wins. Bypass Axiom entirely so
  // tests stay hermetic and never touch the network.
  if (opts.destination) {
    return pino(baseOptions, opts.destination);
  }

  const axiomToken = process.env.AXIOM_TOKEN;
  const axiomDataset = process.env.AXIOM_DATASET;

  // No Axiom config: stdout-only, same as before.
  if (!axiomToken || !axiomDataset) {
    return pino(baseOptions);
  }

  // Both env vars set: fan out to stdout AND Axiom.
  const streams: StreamEntry[] = [
    { stream: process.stdout },
    { stream: buildAxiomStream(axiomToken, axiomDataset) },
  ];

  return pino(baseOptions, multistream(streams));
}

/**
 * Flush any in-flight Axiom batches. Safe to call when Axiom isn't configured
 * (no-op). Lambda/bot handlers should `await flush()` (or pass it to Vercel's
 * `waitUntil`) before the function instance terminates so logs aren't lost on
 * serverless tear-down.
 */
export async function flush(): Promise<void> {
  if (!sharedAxiom) return;
  await sharedAxiom.flush();
}

export type { Logger } from "pino";
