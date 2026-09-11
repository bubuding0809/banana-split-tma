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

// Keys ignored only on the response side. `message_thread_id` is a forum
// topic id when it appears in a *request* (must stay compared there), but
// on the *response* side it doubles as the id of the message being replied
// to, which is a fresh per-run value — same class as `message_id` above.
const RESPONSE_ONLY_IGNORED_KEYS = new Set(["message_thread_id"]);

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const STARTAPP_RE = /startapp=[A-Za-z0-9_-]+/g;

/** Strip volatile keys, mask per-run identifiers inside strings, sort keys.
 *  `extraIgnored` adds keys to drop beyond IGNORED_KEYS — used to ignore
 *  `message_thread_id` on the response side only. */
export function normalize(
  value: unknown,
  extraIgnored: ReadonlySet<string> = new Set()
): unknown {
  if (typeof value === "string") {
    return value
      .replace(UUID_RE, "<uuid>")
      .replace(STARTAPP_RE, "startapp=<payload>");
  }
  if (Array.isArray(value)) return value.map((v) => normalize(v, extraIgnored));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      if (IGNORED_KEYS.has(key) || extraIgnored.has(key)) continue;
      out[key] = normalize(
        (value as Record<string, unknown>)[key],
        extraIgnored
      );
    }
    return out;
  }
  return value;
}

/**
 * Concurrent calls (e.g. a `Promise.all` fan-out) land in the recording in
 * whatever order their HTTP responses complete, which is a race unrelated
 * to any real behavior change. To compare such runs order-insensitively
 * without hiding a genuinely changed or missing call, walk the list and,
 * for every maximal run of *consecutive* entries sharing the same method,
 * stable-sort just that run by its normalized request JSON. Runs broken up
 * by a different method in between are left positional.
 */
export function canonicalizeRuns(entries: RecordedEntry[]): RecordedEntry[] {
  const result: RecordedEntry[] = [];
  let i = 0;
  while (i < entries.length) {
    let j = i + 1;
    while (j < entries.length && entries[j].method === entries[i].method) j++;
    const run = entries.slice(i, j);
    if (run.length > 1) {
      const keyed = run.map((e, idx) => ({
        e,
        idx,
        key: JSON.stringify(normalize(e.request)),
      }));
      keyed.sort((x, y) => {
        if (x.key < y.key) return -1;
        if (x.key > y.key) return 1;
        return x.idx - y.idx; // stable: preserve original order on ties
      });
      result.push(...keyed.map((k) => k.e));
    } else {
      result.push(...run);
    }
    i = j;
  }
  return result;
}

export function diffRecordings(
  baseline: RecordedEntry[],
  candidate: RecordedEntry[]
): string[] {
  const problems: string[] = [];
  const canonicalBaseline = canonicalizeRuns(baseline);
  const canonicalCandidate = canonicalizeRuns(candidate);
  const count = Math.max(canonicalBaseline.length, canonicalCandidate.length);
  for (let i = 0; i < count; i++) {
    const a = canonicalBaseline[i];
    const b = canonicalCandidate[i];
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
    const resA = JSON.stringify(
      normalize(a.response, RESPONSE_ONLY_IGNORED_KEYS)
    );
    const resB = JSON.stringify(
      normalize(b.response, RESPONSE_ONLY_IGNORED_KEYS)
    );
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
