import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { chatCommands } from "./commands/chat.js";
import { expenseCommands } from "./commands/expense.js";
import { settlementCommands } from "./commands/settlement.js";
import { snapshotCommands } from "./commands/snapshot.js";
import { currencyCommands } from "./commands/currency.js";
import { reminderCommands } from "./commands/reminder.js";
import { meCommands } from "./commands/me.js";
import { categoryCommands } from "./commands/category.js";
import { recurringCommands } from "./commands/recurring.js";
import type { Command } from "./commands/types.js";
import { resolveApiKey, resolveApiUrl, writeConfigFile } from "./config.js";
import { createTrpcClient } from "./client.js";
import { success, error } from "./output.js";

const ALL_COMMANDS: Command[] = [
  ...chatCommands,
  ...expenseCommands,
  ...settlementCommands,
  ...snapshotCommands,
  ...currencyCommands,
  ...reminderCommands,
  ...meCommands,
  ...categoryCommands,
  ...recurringCommands,
];

const GLOBAL_OPTIONS = {
  "api-key": {
    type: "string" as const,
    description: "API key for authentication",
  },
  "api-url": { type: "string" as const, description: "Override API base URL" },
};

function showHelp(): never {
  const commands = ALL_COMMANDS.map((cmd) => ({
    name: cmd.name,
    description: cmd.description,
  }));

  const globalOptions = Object.entries(GLOBAL_OPTIONS).map(([name, opt]) => ({
    name: `--${name}`,
    type: opt.type,
    description: opt.description,
  }));

  return success({
    name: "banana",
    description: "Agent-first CLI for Banana Split expense tracking API",
    agent_instructions:
      "To see detailed options, required fields, and examples for a specific command, run: banana <command> --help",
    commands: [
      { name: "help", description: "Show this help information" },
      {
        name: "login",
        description: "Save API key to config file",
      },
      {
        name: "install-skill",
        description:
          "Output Agent Skills spec skill path for AI agent integration",
      },
      ...commands,
    ],
    globalOptions,
  });
}

function handleLogin(args: string[]): never {
  const { values } = parseArgs({
    args,
    options: {
      "api-key": { type: "string" },
      "api-url": { type: "string" },
    },
    strict: false,
  });

  const apiKey = values["api-key"] as string | undefined;
  if (!apiKey) {
    return error("missing_option", "--api-key is required", "login");
  }

  const config: { apiKey: string; apiUrl?: string } = { apiKey };
  const apiUrl = values["api-url"] as string | undefined;
  if (apiUrl) {
    config.apiUrl = apiUrl;
  }

  writeConfigFile(config);
  return success({ ok: true, message: "API key saved to ~/.bananasplit.json" });
}

function handleInstallSkill(): never {
  const skillDir = new URL("../skills/banana-cli", import.meta.url);
  const skillPath = fileURLToPath(skillDir);
  if (!existsSync(skillPath)) {
    return error(
      "unexpected_error",
      `Skill directory not found at ${skillPath}. Package may be corrupted — try reinstalling.`
    );
  }
  return success({
    skill_path: skillPath,
    skill_name: "banana-cli",
    hint: "Copy this directory to your agent's skills location",
  });
}

async function main(): Promise<never> {
  const args = process.argv.slice(2);
  const commandName = args[0];

  // Handle global help: no args, or just "help" or "--help"
  if (
    !commandName ||
    (commandName === "help" && args.length === 1) ||
    (commandName === "--help" && args.length === 1)
  ) {
    return showHelp();
  }

  // Handle command-specific help
  if (
    args.includes("--help") ||
    args.includes("-h") ||
    commandName === "help"
  ) {
    const targetCommandName = commandName === "help" ? args[1] : commandName;
    const command = ALL_COMMANDS.find((cmd) => cmd.name === targetCommandName);
    if (command) {
      return success({
        command: command.name,
        description: command.description,
        agentGuidance: command.agentGuidance,
        examples: command.examples,
        options: Object.entries(command.options).map(([name, opt]) => ({
          name: `--${name}`,
          type: opt.type,
          description: opt.description,
          required: opt.required,
          default: opt.default,
        })),
      });
    }
    // If command not found, let it fall through to the unknown command error below
  }

  // Handle login separately (no auth needed)
  if (commandName === "login") {
    return handleLogin(args.slice(1));
  }

  // Handle install-skill (no auth needed)
  if (commandName === "install-skill") {
    return handleInstallSkill();
  }

  // --- Regular command dispatch ---
  const commandArgs = args.slice(1);

  // Parse global options first to extract api-key and api-url
  const { values: globalValues } = parseArgs({
    args: commandArgs,
    options: {
      "api-key": { type: "string" },
      "api-url": { type: "string" },
    },
    strict: false,
  });

  const apiKey = resolveApiKey(globalValues["api-key"] as string | undefined);
  if (!apiKey) {
    return error(
      "auth_error",
      "No API key found. Set via --api-key, BANANA_SPLIT_API_KEY env var, or run: banana login --api-key <key>"
    );
  }

  const apiUrl = resolveApiUrl(globalValues["api-url"] as string | undefined);

  // Find matching command
  const command = ALL_COMMANDS.find((cmd) => cmd.name === commandName);
  if (!command) {
    return error(
      "unknown_command",
      `Unknown command: ${commandName}. Run 'banana help' to see available commands.`
    );
  }

  // Build parseArgs options config from command's options + global options
  const optionsConfig: Record<string, { type: "string" | "boolean" }> = {};
  for (const [name, opt] of Object.entries(command.options)) {
    optionsConfig[name] = { type: opt.type };
  }
  // Add global options
  optionsConfig["api-key"] = { type: "string" };
  optionsConfig["api-url"] = { type: "string" };

  const { values } = parseArgs({
    args: commandArgs,
    options: optionsConfig,
    strict: false,
  });

  // Remove global options from parsed values before passing to command
  const commandValues = { ...values };
  delete commandValues["api-key"];
  delete commandValues["api-url"];

  const trpc = createTrpcClient(apiKey, apiUrl);

  return command.execute(commandValues, trpc) as Promise<never>;
}

main().catch((err) => {
  error("unexpected_error", err instanceof Error ? err.message : String(err));
});
