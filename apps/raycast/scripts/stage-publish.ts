import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const RAYCAST_DIR = resolve(SCRIPT_DIR, "..");
const STAGE_DIR = join(RAYCAST_DIR, ".publish-stage");
const REPO_ROOT = resolve(RAYCAST_DIR, "..", "..");
const CATEGORIES_PKG = join(REPO_ROOT, "packages", "categories");

const args = new Set(process.argv.slice(2));
const SHOULD_INSTALL = args.has("--install");

function log(msg: string): void {
  console.log(`[stage] ${msg}`);
}

function run(cmd: string, cmdArgs: string[], cwd: string): void {
  const result = spawnSync(cmd, cmdArgs, { cwd, stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${cmdArgs.join(" ")} failed in ${cwd}`);
  }
}

function exists(p: string): boolean {
  return existsSync(p);
}

// ---------------------------------------------------------------------------
// 1. Reset the stage directory.
// ---------------------------------------------------------------------------
log(`resetting ${STAGE_DIR}`);
rmSync(STAGE_DIR, { recursive: true, force: true });
mkdirSync(STAGE_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// 2. Copy the extension source. We deliberately exclude tests, node_modules,
//    pre-existing build outputs, and the dev tree's package-lock.json. The
//    stage lockfile is regenerated from scratch below.
// ---------------------------------------------------------------------------
const COPY_ENTRIES: Array<{ src: string; dst: string; required: boolean }> = [
  { src: "src", dst: "src", required: true },
  { src: "assets", dst: "assets", required: true },
  { src: "metadata", dst: "metadata", required: false },
  { src: "README.md", dst: "README.md", required: true },
  { src: "CHANGELOG.md", dst: "CHANGELOG.md", required: true },
  { src: "tsconfig.json", dst: "tsconfig.json", required: true },
  { src: "eslint.config.js", dst: "eslint.config.js", required: true },
  { src: ".prettierrc", dst: ".prettierrc", required: false },
];

for (const entry of COPY_ENTRIES) {
  const src = join(RAYCAST_DIR, entry.src);
  const dst = join(STAGE_DIR, entry.dst);
  if (!exists(src)) {
    if (entry.required) throw new Error(`required source missing: ${src}`);
    continue;
  }
  cpSync(src, dst, { recursive: true });
}
log("copied extension source");

// ---------------------------------------------------------------------------
// 3. Vendor @repo/categories. The raycast extension only consumes
//    BASE_CATEGORIES (value) and BaseCategory (type), so we copy just the two
//    source files this depends on. Keeping the surface small avoids dragging
//    in ai/zod/etc. that @repo/categories declares for its other exports.
// ---------------------------------------------------------------------------
const VENDOR_DIR = join(STAGE_DIR, "src", "lib", "_vendor");
mkdirSync(VENDOR_DIR, { recursive: true });

const catTypesSrc = readFileSync(join(CATEGORIES_PKG, "src", "types.ts"), "utf8");
writeFileSync(join(VENDOR_DIR, "categories-types.ts"), catTypesSrc);

let catBaseSrc = readFileSync(join(CATEGORIES_PKG, "src", "base.ts"), "utf8");
// Rewrite the .js-suffixed type import to our local file (no .js suffix because
// the staged tree compiles with `module: commonjs` per the extension tsconfig).
catBaseSrc = catBaseSrc.replace(/from\s+"\.\/types\.js"/g, 'from "./categories-types"');
writeFileSync(join(VENDOR_DIR, "categories-base.ts"), catBaseSrc);

writeFileSync(
  join(VENDOR_DIR, "categories.ts"),
  `export { BASE_CATEGORIES } from "./categories-base";\n` +
    `export type { BaseCategory } from "./categories-types";\n`,
);
log("vendored @repo/categories");

// ---------------------------------------------------------------------------
// 4. Stub @dko/trpc. Raycast source uses it as a type-only import
//    (`import type { AppRouter }` in src/lib/trpc.ts), so the staged copy gets
//    `type AppRouter = any` and loses static type narrowing on tRPC calls.
//    The dev tree keeps the workspace dep and full type safety; the published
//    JS that ray build emits is identical either way.
// ---------------------------------------------------------------------------
writeFileSync(
  join(VENDOR_DIR, "trpc-types.ts"),
  `// AppRouter is sourced from @dko/trpc in the dev tree. The Raycast Store CI\n` +
    `// is npm-only and cannot resolve workspace deps, so the published artifact\n` +
    `// stubs the type to 'any'. Full type safety stays in the dev tree.\n` +
    `// eslint-disable-next-line @typescript-eslint/no-explicit-any\n` +
    `export type AppRouter = any;\n`,
);
log("stubbed @dko/trpc");

// ---------------------------------------------------------------------------
// 5. Rewrite the two import sites in the staged source so they point at the
//    vendor files. The dev source is never touched.
// ---------------------------------------------------------------------------
type Rewrite = { file: string; from: string; to: string };

const REWRITES: Rewrite[] = [
  {
    file: "src/lib/trpc.ts",
    from: 'from "@dko/trpc"',
    to: 'from "./_vendor/trpc-types"',
  },
  {
    file: "src/tools/list-expenses.ts",
    from: 'from "@repo/categories"',
    to: 'from "../lib/_vendor/categories"',
  },
];

for (const r of REWRITES) {
  const p = join(STAGE_DIR, r.file);
  const text = readFileSync(p, "utf8");
  if (!text.includes(r.from)) {
    throw new Error(`stage rewrite missed: '${r.from}' not found in ${r.file}`);
  }
  writeFileSync(p, text.replaceAll(r.from, r.to));
  log(`rewrote import in ${r.file}`);
}

// Final guard: walk the staged src tree and fail if any workspace import
// still references @dko/* or @repo/*. Catches the case where someone adds a
// new workspace import without updating REWRITES above.
function findResidualWorkspaceImports(dir: string): string[] {
  const hits: string[] = [];
  const stack: string[] = [dir];
  // Match any quoted module specifier starting with @dko/ or @repo/. This catches
  // `import ... from`, `export ... from`, side-effect `import "..."`, and
  // dynamic `import("...")`/`require("...")` forms in a single pass. False
  // positives on unrelated string literals are unlikely in source code and
  // would be caught early during stage:verify.
  const WORKSPACE_RE = /["'](@dko\/[^"']+|@repo\/[^"']+)["']/g;
  while (stack.length) {
    const current = stack.pop()!;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!/\.(ts|tsx|mts|cts)$/.test(entry.name)) continue;
      const text = readFileSync(full, "utf8");
      let m: RegExpExecArray | null;
      WORKSPACE_RE.lastIndex = 0;
      while ((m = WORKSPACE_RE.exec(text))) {
        hits.push(`${full.replace(STAGE_DIR + "/", "")}: ${m[1]}`);
      }
    }
  }
  return hits;
}

const residual = findResidualWorkspaceImports(join(STAGE_DIR, "src"));
if (residual.length > 0) {
  throw new Error(
    `residual workspace imports in staged source — add to REWRITES in stage-publish.ts:\n  ${residual.join("\n  ")}`,
  );
}
log("no residual @dko/* or @repo/* imports in staged source");

// Format the vendor dir with the extension's prettier config — the source
// packages may use a narrower printWidth than apps/raycast (120).
const prettierBin = join(RAYCAST_DIR, "node_modules", ".bin", "prettier");
if (exists(prettierBin)) {
  run(prettierBin, ["--write", "--log-level", "warn", "src/lib/_vendor"], STAGE_DIR);
  log("formatted vendored files");
} else {
  log("prettier binary not found in dev tree — skipping vendor format (lint may flag style)");
}

// ---------------------------------------------------------------------------
// 6. Build the staged package.json. Strip workspace deps, drop scripts that
//    only apply to the dev tree (stage/dry-run/publish — the staged copy is
//    not itself stageable), and keep the prepublishOnly guard so a misfired
//    `npm publish` from the stage points at the Raycast CLI instead.
// ---------------------------------------------------------------------------
type RawPkg = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  [key: string]: unknown;
};

const devPkg = JSON.parse(readFileSync(join(RAYCAST_DIR, "package.json"), "utf8")) as RawPkg;

if (devPkg.dependencies) {
  delete devPkg.dependencies["@dko/trpc"];
  delete devPkg.dependencies["@repo/categories"];
}

devPkg.scripts = {
  build: "ray build",
  dev: "ray develop",
  lint: "ray lint",
  "fix-lint": "ray lint --fix",
  "check-types": "tsc --noEmit",
  prepublishOnly:
    'echo "\\n\\nIt seems like you are trying to publish the Raycast extension to npm.\\n\\nIf you did intend to publish it to npm, remove the `prepublishOnly` script and rerun `npm publish` again.\\nIf you wanted to publish it to the Raycast Store instead, use `npm run publish` instead.\\n\\n" && exit 1',
  publish: "npx @raycast/api@latest publish",
};

writeFileSync(join(STAGE_DIR, "package.json"), JSON.stringify(devPkg, null, 2) + "\n");
log("wrote staged package.json (workspace deps removed)");

// ---------------------------------------------------------------------------
// 7. Generate the lockfile. `--package-lock-only` is enough for CI to verify
//    the manifest resolves cleanly; pass --install to also populate
//    node_modules for ray lint / ray build.
// ---------------------------------------------------------------------------
const installArgs = SHOULD_INSTALL
  ? ["install", "--no-audit", "--no-fund"]
  : ["install", "--package-lock-only", "--no-audit", "--no-fund"];
log(`npm ${installArgs.join(" ")} in stage`);
run("npm", installArgs, STAGE_DIR);

log(`stage ready at ${STAGE_DIR}`);
