# CLI Agent Discoverability Enhancement Design

## Overview

The Banana Split CLI is designed to be operated by AI agents. Currently, the `--help` command outputs a large JSON payload containing all commands and their options. This design enhances the CLI's discoverability by adding structured metadata (required fields, examples, agent guidance) and splitting the help system into global and command-specific views to optimize LLM context usage.

## Goals

1. Provide explicit metadata (required fields, defaults) so agents can construct valid commands without trial and error.
2. Provide concrete examples of complex CLI invocations (e.g., JSON arrays for custom splits).
3. Provide conversational guidance on _when_ and _how_ an agent should use specific commands.
4. Reduce the token payload of the global `--help` command by implementing command-specific help.

## Architecture & Data Flow

### 1. Command Interface Updates

The `Command` and `CommandOption` interfaces in `src/commands/types.ts` will be updated to include new metadata fields.

```typescript
export interface CommandOption {
  type: "string" | "boolean";
  description: string;
  required?: boolean;
  default?: string | boolean;
}

export interface Command {
  name: string;
  description: string;
  agentGuidance?: string;
  examples?: string[];
  options: Record<string, CommandOption>;
  execute: (
    opts: Record<string, string | boolean | string[] | undefined>,
    trpc: TrpcClient
  ) => Promise<unknown>;
}
```

### 2. Help System Refactoring

The help system in `src/cli.ts` will be split into two distinct modes:

#### Global Help (`banana --help` or `banana help`)

Returns a concise list of commands and their descriptions, omitting the detailed options to save tokens. It will include a top-level instruction directing agents to use command-specific help.

```json
{
  "name": "banana",
  "description": "Agent-first CLI for Banana Split expense tracking API",
  "agent_instructions": "To see detailed options, required fields, and examples for a specific command, run: banana <command> --help",
  "commands": [
    {
      "name": "create-expense",
      "description": "Create a new expense with automatic split calculation"
    }
    // ...
  ],
  "globalOptions": [
    // ...
  ]
}
```

#### Command-Specific Help (`banana <command> --help`)

When `--help` is passed alongside a command name, the CLI will intercept the execution and output detailed JSON for that specific command.

```json
{
  "command": "create-expense",
  "description": "Create a new expense with automatic split calculation",
  "agentGuidance": "Use this when a user says 'I paid $50 for dinner'. Always resolve the chat ID first.",
  "examples": [
    "banana create-expense --amount 50 --description 'Dinner' --payer-id 123 --split-mode EQUAL --participant-ids 123,456"
  ],
  "options": [
    {
      "name": "--amount",
      "type": "string",
      "description": "The total amount",
      "required": true
    },
    {
      "name": "--chat-id",
      "type": "string",
      "description": "The numeric chat ID",
      "required": false
    }
  ]
}
```

## Implementation Steps

1. **Update Types**: Modify `src/commands/types.ts` to include `required`, `default`, `agentGuidance`, and `examples`.
2. **Update CLI Entrypoint**: Modify `src/cli.ts` to handle command-specific help interception.
3. **Update Global Help**: Modify `showHelp()` in `src/cli.ts` to output the concise global format.
4. **Update Command Definitions**: Go through all command files (`chat.ts`, `expense.ts`, `settlement.ts`, `snapshot.ts`, `currency.ts`) and populate the new metadata fields for every command.

## Error Handling

- If an agent requests help for an unknown command (`banana unknown-cmd --help`), the CLI will return the standard `unknown_command` error JSON.
- The existing error handling for missing required options during execution remains unchanged, but agents should hit these errors less frequently due to the explicit `required` flags in the help output.

## Testing

- Verify global help outputs concise JSON.
- Verify command-specific help outputs detailed JSON with examples and guidance.
- Verify normal command execution is not affected by the help interception logic.
