# `@banananasplitz/cli` — Agent Instructions

CLI scoped rules. The repo-level `AGENTS.md` at the root applies too. When they conflict, this file wins for anything under `apps/cli/`.

## What this app is

Agent-first command-line interface for the Banana Split tRPC API. Ships as the npm package `@banananasplitz/cli`. Runtime surface is a single bundled file (`dist/cli.js`) produced by `tsup`. The package also ships a bundled **Agent Skill** (`skills/banana-cli/SKILL.md`) that teaches AI agents how to drive the CLI.

## The skill-capabilities invariant

**Whenever you change what the CLI can do, you MUST update the skill in the same PR.**

The skill is not a README. It's a contract shipped to external AI agents: they read it, then shell out to `banana <command>`. A capability missing from the skill is invisible to every OpenCode/Claude Code/Cursor user who installed it. A stale skill actively causes wrong tool calls.

"Change what the CLI can do" means:

- Adding a command → add a table row in SKILL.md, add a workflow block if the command belongs to a multi-step pattern, add an entry in README.md for humans.
- Removing a command → remove the table row and any workflow block that references it.
- Renaming a flag or option → update every row/example/workflow that uses it.
- Changing required vs optional flags → update the "Key Flags" column.
- Changing output shape → update any workflow block whose bash comments show sample output.
- Adding a common pitfall you encountered → add an entry to "Common Mistakes".

If you're unsure whether a change touches capabilities, re-read SKILL.md and ask: "would an agent relying on this doc be wrong if it acted on my branch?" If yes, update it.

## Versioning

**Inline bumps only.** Every PR that touches runtime CLI code (`apps/cli/src/**`, excluding `*.test.ts` / `*.spec.ts`) MUST bump `apps/cli/package.json` version AND `apps/cli/skills/banana-cli/SKILL.md` frontmatter `version:` in the same commit. Both values must match at all times.

CI enforces both:

- PR check `cli-version-bump` fails if runtime source changed without a version bump.
- The same job fails if `package.json` and `SKILL.md` frontmatter versions don't match.

Semver intent:

- **Patch** (0.x.N+1): bugfix, internal refactor, skill-copy tweak, dependency bump with no behavior change.
- **Minor** (0.x+1.0): new command, new flag, new output field (additive).
- **Major** (x+1.0.0): removed command, renamed flag, breaking output shape change. Reserved for coordinated releases — don't major-bump in a drive-by PR.

## Release pipeline

Merging to `main` triggers `.github/workflows/deploy.yml` → `publish-cli` job. It:

1. Runs only if `apps/cli/**` or `packages/**` changed.
2. Checks if `apps/cli/package.json` version already exists on npm; if yes, skips with a notice.
3. Otherwise publishes to npm via **OIDC Trusted Publishing** (no token in repo) with signed `--provenance`.

There's no manual `npm publish` step. There's no npm token to rotate. Don't add one — if you see a PR adding `NPM_TOKEN` anywhere, push back.

## Testing changes locally

For dev iteration, use the local build directly instead of `npm install -g`:

```bash
pnpm --filter @banananasplitz/cli run build
node apps/cli/dist/cli.js <command>
```

To test against prod API, have a user-level key saved (`banana login --api-key <usk_...>`) or set `BANANA_SPLIT_API_KEY` in your env. For local API, pass `--api-url http://localhost:8081/api/trpc` (matches the Lambda dev server port).

When you touch CLI commands, run the unit tests with the existing mock pattern in `apps/cli/src/commands/chat.test.ts` as reference. Mocked tRPC + assertions on `query()` / `mutate()` call arguments — don't make real network calls in tests.

## File map

```
apps/cli/
├── src/
│   ├── cli.ts              # Entry point; argv parsing, dispatch, global options
│   ├── client.ts           # tRPC client factory
│   ├── config.ts           # ~/.bananasplit.json read/write + resolution order
│   ├── output.ts           # success() / error() / run() — JSON-to-stdout helpers
│   ├── scope.ts            # resolveChatId for chat-scoped vs user-scoped keys
│   └── commands/
│       ├── types.ts        # Command interface
│       ├── chat.ts         # chat router commands
│       ├── expense.ts      # expense router commands
│       ├── settlement.ts
│       ├── snapshot.ts
│       ├── currency.ts
│       ├── reminder.ts
│       ├── me.ts           # user-level cross-chat commands (list-my-balances, list-my-spending)
│       └── *.test.ts       # co-located unit tests
├── skills/banana-cli/
│   └── SKILL.md            # Agent Skill spec — updated alongside every capability change
├── examples/               # Sample JSON inputs for bulk import etc.
├── package.json
├── README.md               # Human-facing docs
└── AGENTS.md               # (this file)
```

## Adding a new command — checklist

1. Create `src/commands/<name>.ts` exporting a `Command[]` (or adding to an existing domain file).
2. Register the export in `src/cli.ts` `ALL_COMMANDS` array.
3. Write `src/commands/<name>.test.ts` matching the pattern in `chat.test.ts` (mock `output.js`, assert dispatch args, assert validation errors).
4. Add a row to the Command Reference table in `skills/banana-cli/SKILL.md`.
5. If the command belongs to a multi-step pattern, add a Workflow block in SKILL.md.
6. Update README.md usage block + commands table.
7. Bump `package.json` version and `SKILL.md` frontmatter `version:` (match each other).
8. Run `pnpm --filter @banananasplitz/cli test` + `pnpm --filter @banananasplitz/cli check-types`.

## Common pitfalls for agents editing this app

- **Forgetting the skill update.** This is the single most common mistake. If you add a command and think "I'll document it later" — there is no later; the CI-enforced capability invariant is here precisely because human memory is unreliable.
- **Bumping `package.json` but not `SKILL.md`.** The parity check catches this, but you'll waste a CI cycle. Bump both in the same edit.
- **Assuming `npm install -g @banananasplitz/cli` reflects your local branch.** It doesn't — npm has only the last published version. Use `node apps/cli/dist/cli.js` for UAT of unpublished changes.
- **Using `console.log` for output.** Always go through `success()` / `error()` from `output.js` so exit codes and stdout/stderr split are correct.
- **Swallowing tRPC errors silently.** Wrap every tRPC call through `run()` so errors get formatted as `{error, message}` JSON to stderr with exit 1.
- **Hardcoding user or chat IDs.** These are always strings-of-bigints on the wire. Use the command's options and `resolveChatId()` for chat lookup.
