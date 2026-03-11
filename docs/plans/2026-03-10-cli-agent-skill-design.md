# CLI Agent Skill — Design Document

**Date**: 2026-03-10
**Status**: Approved

## Problem

The `@banananasplitz/cli` was built for AI agents, but agents have no way to learn how to use it. Without a skill, agents must discover the CLI via README, run `banana help`, parse the output, then figure out multi-step workflows from scratch. A lightweight skill eliminates this friction.

## Decision: Agent Skills spec, shipped in npm package

### Approach chosen

Follow the [Agent Skills spec](https://agentskills.io/specification) — ship a `SKILL.md` inside the npm package. Add a `banana install-skill` command that prints the filesystem path so users/tools can copy it to their agent's skill directory.

### Alternatives considered

1. **Project-local skill** (`.agents/skills/`) — rejected because the primary audience is external consumers, not monorepo developers.
2. **TanStack Intent integration** — rejected because Intent discovers skills via `node_modules` scanning, but our CLI is a standalone global tool, not a project dependency. The discovery mechanism doesn't match our distribution model.
3. **Informal (no spec)** — rejected because spec compliance enables interoperability with the growing ecosystem of agent platforms.

### Key decisions

- **No agent-specific logic** in `install-skill`. The command prints the path; the user/tool decides where to copy it.
- **No `@tanstack/intent` dependency**. If Intent adds global package scanning later, we can adopt it then.
- **Self-contained skill** — no `scripts/`, `references/`, or `assets/` directories. The CLI is the tool; the skill teaches agents to drive it.

## Deliverables

### 1. `apps/cli/skills/banana-cli/SKILL.md`

Agent Skills spec-compliant file (~150-200 lines) with:

**Frontmatter:**

```yaml
---
name: banana-cli
description: >
  Manage shared expenses via the Banana Split CLI. Use when tracking
  group expenses, splitting bills, checking debts, settling payments,
  or working with expense snapshots.
metadata:
  author: banananasplitz
  version: "0.1.2"
---
```

**Sections:**

1. **Setup** (~15 lines) — Auth with `banana login`, env var, or `--api-key` flag. Resolution order: flag > env > config file.

2. **Output format** (~10 lines) — JSON to stdout (exit 0), JSON errors to stderr (exit 1). BigInt user/chat IDs serialized as strings. `banana help` outputs machine-readable command schema.

3. **Command reference** (~40 lines) — Compact table of all 15 commands with key flags. Enough for an agent to construct the right command, not a full man page.

4. **Common mistakes** (~15 lines) — What NOT to do:

   - Don't parse BigInt user IDs as JavaScript numbers (they overflow)
   - Don't forget `--currency` for multi-currency groups
   - Chat-scoped API keys auto-resolve `--chat-id` — don't pass it explicitly
   - Don't use `get-debts` when you want optimized settlements — use `get-simplified-debts`

5. **Workflows** (~60 lines) — Three multi-step recipes:
   - **Settle all debts**: `get-simplified-debts` -> iterate results -> `create-settlement` for each
   - **Log a group meal**: `get-chat` (get member IDs) -> `create-expense` with EQUAL split -> `list-expenses` to confirm
   - **Financial summary**: `get-debts` + `get-totals` per member -> present consolidated view

### 2. `banana install-skill` command

New built-in command (alongside `help` and `login`) that prints the path to the skill directory:

```bash
$ banana install-skill
{
  "skill_path": "/usr/local/lib/node_modules/@banananasplitz/cli/skills/banana-cli",
  "skill_name": "banana-cli",
  "hint": "Copy this directory to your agent's skills location"
}
```

Implementation: Resolves path relative to the installed package using `import.meta.url`. No auth or tRPC client needed.

### 3. Build/publish changes

- `package.json` `"files"` array: Add `"skills"` so the directory is included in the npm tarball.
- `tsup.config.ts`: No change — `skills/` contains only markdown, ships as-is.
- `install-skill` is a built-in command in `cli.ts`, not in the command dispatch table (no auth needed).

### 4. README update

Add agent integration section to `apps/cli/README.md` documenting `banana install-skill` and per-agent copy instructions.

## What we're NOT doing

- No `@tanstack/intent` integration
- No agent-specific auto-detection or auto-installation
- No `scripts/`, `references/`, or `assets/` directories
- No staleness checking (manual maintenance — CLI is stable)

## File structure after implementation

```
apps/cli/
  skills/
    banana-cli/
      SKILL.md
  src/
    cli.ts          # Add install-skill handling
    ...
  package.json      # Add "skills" to files array
  README.md         # Add agent integration section
```
