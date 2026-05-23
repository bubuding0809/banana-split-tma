import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const RAYCAST_DIR = resolve(SCRIPT_DIR, "..");
const STAGE_DIR = join(RAYCAST_DIR, ".publish-stage");

let failures = 0;
let warnings = 0;

function header(msg: string): void {
  console.log(`\n[dry-run] === ${msg} ===`);
}

function ok(msg: string): void {
  console.log(`[dry-run] ok   ${msg}`);
}

function warn(msg: string): void {
  warnings += 1;
  console.warn(`[dry-run] warn ${msg}`);
}

function fail(msg: string): void {
  failures += 1;
  console.error(`[dry-run] FAIL ${msg}`);
}

function run(cmd: string, args: string[], cwd: string): void {
  const result = spawnSync(cmd, args, { cwd, stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed in ${cwd}`);
  }
}

// ---------------------------------------------------------------------------
// Phase 1 — CLI parity (runs against the dev tree because check-cli-parity
// walks ../cli/src/commands relative to apps/raycast/scripts/).
// ---------------------------------------------------------------------------
header("Phase 1: CLI ↔ Raycast tool parity (dev tree)");
run("npx", ["tsx", "scripts/check-cli-parity.ts"], RAYCAST_DIR);

// ---------------------------------------------------------------------------
// Phase 2 — stage the publishable folder with a full npm install.
// ---------------------------------------------------------------------------
header("Phase 2: stage with --install");
run("npx", ["tsx", "scripts/stage-publish.ts", "--install"], RAYCAST_DIR);

// ---------------------------------------------------------------------------
// Phase 3 — ray lint + ray build inside the stage. This is exactly what the
// Raycast Store CI runs on the contributed extension folder.
// ---------------------------------------------------------------------------
header("Phase 3: ray lint + ray build (staged)");
run("npx", ["ray", "lint"], STAGE_DIR);
run("npx", ["ray", "build"], STAGE_DIR);

// ---------------------------------------------------------------------------
// Phase 4 — manifest validation.
// ---------------------------------------------------------------------------
header("Phase 4: manifest validation");

type Pkg = {
  name?: string;
  title?: string;
  description?: string;
  author?: string;
  license?: string;
  icon?: string;
  categories?: string[];
  platforms?: string[];
  commands?: unknown[];
  tools?: unknown[];
  preferences?: unknown[];
  version?: string;
  dependencies?: Record<string, string>;
};

const pkg = JSON.parse(readFileSync(join(STAGE_DIR, "package.json"), "utf8")) as Pkg;

const requiredFields: Array<keyof Pkg> = [
  "name",
  "title",
  "description",
  "author",
  "license",
  "icon",
  "categories",
  "commands",
];
for (const field of requiredFields) {
  if (pkg[field] === undefined || pkg[field] === null || pkg[field] === "") {
    fail(`package.json missing required field: ${String(field)}`);
  }
}
if (pkg.license !== "MIT") fail(`license must be "MIT", got "${pkg.license}"`);
if (!Array.isArray(pkg.categories) || pkg.categories.length === 0) {
  fail("categories must be a non-empty array");
}

const ALLOWED_CATEGORIES = new Set([
  "Applications",
  "Communication",
  "Data",
  "Documentation",
  "Design Tools",
  "Developer Tools",
  "Finance",
  "Fun",
  "Media",
  "News",
  "Productivity",
  "Security",
  "System",
  "Web",
  "Other",
]);
for (const c of pkg.categories ?? []) {
  if (!ALLOWED_CATEGORIES.has(c)) fail(`category not in Raycast's allowed list: "${c}"`);
}

const description = pkg.description ?? "";
if (description.length === 0) {
  fail("description is empty");
} else if (description.length > 160) {
  warn(`description is ${description.length} chars (Raycast recommends a single short sentence)`);
}

const iconPath = join(STAGE_DIR, "assets", pkg.icon ?? "");
if (!existsSync(iconPath)) {
  fail(`icon file missing: assets/${pkg.icon}`);
} else {
  ok(`icon present at assets/${pkg.icon}`);
}

const readmePath = join(STAGE_DIR, "README.md");
if (!existsSync(readmePath)) {
  fail("README.md missing from stage");
} else if (readFileSync(readmePath, "utf8").length < 500) {
  fail("README.md is too short (< 500 chars)");
} else {
  ok("README.md present");
}

const changelogPath = join(STAGE_DIR, "CHANGELOG.md");
if (!existsSync(changelogPath)) {
  fail("CHANGELOG.md missing from stage");
} else {
  const changelogText = readFileSync(changelogPath, "utf8");
  if (!/^## /m.test(changelogText)) {
    fail("CHANGELOG.md has no version heading (## ...)");
  } else {
    ok("CHANGELOG.md has at least one version heading");
  }
  // Catch unfilled placeholders like {PR_MERGE_DATE} before publish.
  const placeholders = changelogText.match(/\{[A-Z][A-Z0-9_]*\}/g);
  if (placeholders) {
    fail(`CHANGELOG.md contains unfilled template placeholders: ${[...new Set(placeholders)].join(", ")}`);
  }
}

// Make sure the dev tree's workspace deps did not survive into the stage.
for (const dep of Object.keys(pkg.dependencies ?? {})) {
  const spec = pkg.dependencies?.[dep] ?? "";
  if (spec.startsWith("workspace:")) fail(`staged package.json still has workspace dep: ${dep}`);
  if (spec.startsWith("file:..") || spec.startsWith("file:/")) {
    fail(`staged package.json has out-of-folder file dep: ${dep} -> ${spec}`);
  }
}

// ---------------------------------------------------------------------------
// Phase 5 — lockfile cleanliness. Raycast CI runs `npm install` against this
// file; any workspace: or out-of-folder file: reference will fail there.
// ---------------------------------------------------------------------------
header("Phase 5: lockfile cleanliness");

type LockEntry = {
  version?: string;
  resolved?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  link?: boolean;
};
type Lock = { packages?: Record<string, LockEntry> };

const lock = JSON.parse(readFileSync(join(STAGE_DIR, "package-lock.json"), "utf8")) as Lock;
const entries = Object.entries(lock.packages ?? {});

let depCount = 0;
for (const [path, entry] of entries) {
  if (path === "") continue;
  depCount += 1;

  if (path.startsWith("..") || path.startsWith("/")) {
    fail(`lockfile path escapes the extension folder: ${path}`);
  }

  // npm v7+ encodes workspace symlinks as `{ "link": true, "resolved": "<rel>" }`
  // without a `version`. These entries would slip past every string check below
  // (no `resolved` matching workspace:/file: patterns), so flag them explicitly.
  if (entry.link === true) {
    fail(`lockfile has symlink (workspace) entry: ${path}${entry.resolved ? ` -> ${entry.resolved}` : ""}`);
    continue;
  }

  const specs: string[] = [];
  if (typeof entry.resolved === "string") specs.push(entry.resolved);
  if (typeof entry.version === "string") specs.push(entry.version);
  for (const v of Object.values(entry.dependencies ?? {})) if (typeof v === "string") specs.push(v);
  for (const v of Object.values(entry.devDependencies ?? {})) if (typeof v === "string") specs.push(v);
  for (const v of Object.values(entry.peerDependencies ?? {})) if (typeof v === "string") specs.push(v);
  for (const v of Object.values(entry.optionalDependencies ?? {})) if (typeof v === "string") specs.push(v);

  for (const spec of specs) {
    if (spec.startsWith("workspace:")) {
      fail(`lockfile entry ${path} carries workspace spec: ${spec}`);
    }
    if (spec.startsWith("file:..")) {
      fail(`lockfile entry ${path} carries out-of-folder file: ${spec}`);
    }
    if (/^file:\//.test(spec)) {
      fail(`lockfile entry ${path} carries absolute file: ${spec}`);
    }
  }
}
ok(`${depCount} dep entries scanned, no workspace/symlink/out-of-folder references`);

// ---------------------------------------------------------------------------
// Phase 6 — screenshots in metadata/.
// ---------------------------------------------------------------------------
header("Phase 6: store screenshots");
const metaDir = join(STAGE_DIR, "metadata");
const screenshots: string[] = existsSync(metaDir)
  ? readdirSync(metaDir).filter((f) => /^bananasplitz-\d+\.png$/.test(f))
  : [];

if (screenshots.length === 0) {
  warn("no metadata/bananasplitz-N.png screenshots found — required for store approval");
} else if (screenshots.length < 3) {
  warn(`${screenshots.length} screenshots found, Raycast recommends 3 (max 6)`);
} else if (screenshots.length > 6) {
  warn(`${screenshots.length} screenshots found, Raycast allows max 6`);
} else {
  ok(`${screenshots.length} screenshots in metadata/`);
}

for (const f of screenshots) {
  const stat = statSync(join(metaDir, f));
  if (stat.size === 0) fail(`screenshot is empty: metadata/${f}`);
}

// ---------------------------------------------------------------------------
// Summary.
// ---------------------------------------------------------------------------
console.log("");
if (failures > 0) {
  console.error(`[dry-run] FAILED — ${failures} error(s), ${warnings} warning(s)`);
  process.exit(1);
}

const aiTools = (pkg.tools ?? []).length;
const commands = (pkg.commands ?? []).length;
const preferences = (pkg.preferences ?? []).length;

console.log(`[dry-run] Dry-run OK — would publish:`);
console.log(`  ${pkg.name} (${pkg.title})${pkg.version ? ` v${pkg.version}` : ""}`);
console.log(`  by ${pkg.author} — ${(pkg.categories ?? []).join(", ")}`);
console.log(`  ${commands} commands, ${aiTools} AI tools, ${preferences} preferences`);
console.log(`  ${screenshots.length} screenshots in metadata/`);
console.log(`  ${depCount} lockfile dep entries, all registry-resolvable`);
if (warnings > 0) {
  console.log(`  ${warnings} warning(s) — review before pressing publish`);
}
