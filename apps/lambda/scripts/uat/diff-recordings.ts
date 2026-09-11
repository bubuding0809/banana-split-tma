import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type RecordedEntry = {
  seq: number;
  method: string;
  request: Record<string, unknown>;
  response: unknown;
};

// Keys whose values legitimately change between two identical runs.
const IGNORED_KEYS = new Set([
  "message_id",
  "reply_to_message_id",
  "date",
  "edit_date",
  "file_id",
  "file_unique_id",
  "file_path",
  "file_size",
  "total_count",
  "pinned_message",
]);

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const STARTAPP_RE = /startapp=[A-Za-z0-9_-]+/g;

/** Strip volatile keys, mask per-run identifiers inside strings, sort keys. */
export function normalize(value: unknown): unknown {
  if (typeof value === "string") {
    return value
      .replace(UUID_RE, "<uuid>")
      .replace(STARTAPP_RE, "startapp=<payload>");
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      if (IGNORED_KEYS.has(key)) continue;
      out[key] = normalize((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

export function diffRecordings(
  baseline: RecordedEntry[],
  candidate: RecordedEntry[]
): string[] {
  const problems: string[] = [];
  const count = Math.max(baseline.length, candidate.length);
  for (let i = 0; i < count; i++) {
    const a = baseline[i];
    const b = candidate[i];
    if (!a || !b) {
      const present = (a ?? b)!;
      problems.push(
        `#${i + 1} ${present.method}: ${a ? "missing in candidate" : "extra in candidate"}`
      );
      continue;
    }
    if (a.method !== b.method) {
      problems.push(`#${i + 1}: method ${a.method} -> ${b.method}`);
      continue;
    }
    const reqA = JSON.stringify(normalize(a.request));
    const reqB = JSON.stringify(normalize(b.request));
    if (reqA !== reqB) {
      problems.push(
        `#${i + 1} ${a.method}: request differs\n  baseline:  ${reqA}\n  candidate: ${reqB}`
      );
    }
    const resA = JSON.stringify(normalize(a.response));
    const resB = JSON.stringify(normalize(b.response));
    if (resA !== resB) {
      problems.push(
        `#${i + 1} ${a.method}: response differs\n  baseline:  ${resA}\n  candidate: ${resB}`
      );
    }
  }
  return problems;
}

export function readJsonl(path: string): RecordedEntry[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as RecordedEntry);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [baselinePath, candidatePath] = process.argv.slice(2);
  if (!baselinePath || !candidatePath) {
    console.error(
      "usage: tsx scripts/uat/diff-recordings.ts <baseline.jsonl> <candidate.jsonl>"
    );
    process.exit(2);
  }
  const baseline = readJsonl(baselinePath);
  const problems = diffRecordings(baseline, readJsonl(candidatePath));
  if (problems.length === 0) {
    console.log(`no differences across ${baseline.length} recorded calls`);
    process.exit(0);
  }
  for (const p of problems) console.error(p);
  console.error(`${problems.length} difference(s)`);
  process.exit(1);
}
