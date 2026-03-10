import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CONFIG_PATH = join(homedir(), ".bananasplit.json");
const DEFAULT_API_URL = "https://banana-split-tma-lambda.vercel.app/api/trpc";

interface Config {
  apiKey?: string;
  apiUrl?: string;
}

function readConfigFile(): Config {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as Config;
  } catch {
    return {};
  }
}

export function writeConfigFile(config: Config): void {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

/** Resolve API key: --api-key flag > BANANA_SPLIT_API_KEY env > config file */
export function resolveApiKey(flagValue?: string): string | undefined {
  return (
    flagValue || process.env.BANANA_SPLIT_API_KEY || readConfigFile().apiKey
  );
}

/** Resolve API URL: --api-url flag > BANANA_SPLIT_API_URL env > config file > default */
export function resolveApiUrl(flagValue?: string): string {
  return (
    flagValue ||
    process.env.BANANA_SPLIT_API_URL ||
    readConfigFile().apiUrl ||
    DEFAULT_API_URL
  );
}
