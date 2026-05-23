import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cliCommandsDir = join(root, "../../apps/cli/src/commands");
const indexSrc = readFileSync(join(root, "src/index.ts"), "utf8");

function kebabToCamel(name: string): string {
  return name.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

function collectCliCommandNames(): string[] {
  const names: string[] = [];
  for (const file of readdirSync(cliCommandsDir)) {
    if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
    const src = readFileSync(join(cliCommandsDir, file), "utf8");
    const re = /^\s+name:\s*"([a-z0-9-]+)"/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      names.push(m[1]);
    }
  }
  return [...new Set(names)].sort();
}

const cliNames = collectCliCommandNames();
const exportRe = /export\s*\{([^}]+)\}/gs;
const exported = new Set<string>();
let block: RegExpExecArray | null;
while ((block = exportRe.exec(indexSrc))) {
  for (const part of block[1].split(",")) {
    const name = part.trim().split(/\s+/)[0];
    if (name && /^[a-zA-Z]/.test(name)) exported.add(name);
  }
}

const missing: string[] = [];
for (const cmd of cliNames) {
  const op = kebabToCamel(cmd);
  if (!exported.has(op)) missing.push(`${cmd} → ${op}`);
}

if (missing.length) {
  console.error(
    "CLI commands missing matching camelCase export in api-ops index.ts:\n"
  );
  missing.forEach((line) => console.error(`  - ${line}`));
  process.exit(1);
}

console.log(
  `OK: ${cliNames.length} CLI commands have matching api-ops exports`
);
