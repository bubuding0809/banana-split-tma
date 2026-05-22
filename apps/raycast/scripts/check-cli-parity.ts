import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  tools?: { name: string }[];
};

const cliCommandsDir = join(root, "../cli/src/commands");
const skip = new Set(["help", "login", "install-skill"]);

function collectCliCommandNames(): string[] {
  const names: string[] = [];
  for (const file of readdirSync(cliCommandsDir)) {
    if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
    const src = readFileSync(join(cliCommandsDir, file), "utf8");
    const re = /name:\s*"([a-z0-9-]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      if (!skip.has(m[1])) names.push(m[1]);
    }
  }
  return [...new Set(names)].sort();
}

const toolNames = (pkg.tools ?? []).map((t) => t.name).sort();
const cliNames = collectCliCommandNames();

const missingInTools = cliNames.filter((n) => !toolNames.includes(n));
const extraInTools = toolNames.filter((n) => !cliNames.includes(n));

if (missingInTools.length || extraInTools.length) {
  console.error("CLI ↔ Raycast tool parity mismatch\n");
  if (missingInTools.length) {
    console.error("CLI commands missing from package.json tools[]:");
    missingInTools.forEach((n) => console.error(`  - ${n}`));
  }
  if (extraInTools.length) {
    console.error("package.json tools[] not in CLI commands:");
    extraInTools.forEach((n) => console.error(`  - ${n}`));
  }
  process.exit(1);
}

console.log(`OK: ${toolNames.length} tools match ${cliNames.length} CLI commands`);
