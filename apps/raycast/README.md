# BananaSplitz

Track shared expenses across your Banana Split groups directly from Raycast — view balances, settle debts, nudge people, and use AI commands to log expenses without leaving your keyboard.

BananaSplitz is the Raycast companion to the [Banana Split](https://t.me/BananaSplit_bot) Telegram bot and mini-app. Sign in once with your user-level API key and your groups, people, and balances are a few keystrokes away.

## Features

- **Groups** — browse your personal, active, and settled groups; split-panel detail with your current balance and recent activity
- **People** — see who you owe and who owes you across every group, with per-group breakdown, Settle All, and Nudge actions
- **`@bananasplitz` AI** — 35 AI tools at full parity with the CLI, covering:
  - Cross-group balances and monthly spending
  - Expense CRUD (with automatic split calculation for equal, exact, percentage, and share-based splits)
  - Settlements, snapshots, and recurring expense templates
  - Telegram group reminders and individual nudges
  - Bulk import/update of expenses from JSON
  - Categories, exchange rates, and chat settings
- **Safe by default** — every mutating action requires a Raycast confirmation prompt before execution

## Setup

1. Open the [Banana Split mini-app](https://t.me/BananaSplit_bot) and copy your user-level API key from the settings screen.
2. Install BananaSplitz and open any command — Raycast will prompt for the **API Key**. Paste it there.
3. (Optional) If you self-host the Banana Split backend, change the **API URL** preference to your tRPC endpoint. The default points at the hosted instance.

The API key is stored by Raycast in the macOS Keychain. Requests are sent only to the configured API URL; the extension has no third-party analytics.

## Usage

### Commands

- **Groups** — list expense groups, drill into transactions, edit or settle individual expenses.
- **People** — cross-group view of counterparties; settle every balance with one person in one action, or send a Telegram nudge.

### AI prompts

Trigger Raycast AI with `@bananasplitz` followed by a natural-language request. Examples:

- `@bananasplitz who owes me money across all groups?`
- `@bananasplitz list my expense groups`
- `@bananasplitz log a $45 dinner split equally in chat 123456789, payer is me (user 111), participants 111 and 222`
- `@bananasplitz settle everything I owe Alex (user 456) across all groups`
- `@bananasplitz what are the simplified debts in Beach House chat 99 in USD?`

Destructive or mutating tools (creating expenses, settlements, reminders, deletions, bulk imports) always show a Raycast confirmation prompt before they run.

## Privacy

- The API key lives in macOS Keychain via Raycast's preferences API. It never leaves your machine except as an `x-api-key` header on outbound requests to the configured API URL.
- BananaSplitz does not ship any analytics or telemetry of its own.
- Requests go only to the API URL set in preferences. By default that is the hosted Banana Split backend; point it elsewhere if you self-host.

## Development

BananaSplitz is developed inside the [Banana Split monorepo](https://github.com/bubuding0809/banana-split-tma). The source lives in `apps/raycast/` and shares the tRPC router and category model with the CLI and mini-app via pnpm workspace dependencies.

Because the Raycast Store CI is npm-only and cannot resolve `workspace:` deps, publishing goes through a **stage-and-publish** pipeline. The dev source keeps its workspace links; a stage script materialises a self-contained copy at `apps/raycast/.publish-stage/` with vendored dependencies and a clean npm lockfile, and the Raycast CLI publishes from there.

Day-to-day:

```bash
pnpm --filter bananasplitz dev          # ray develop against the workspace source
pnpm --filter bananasplitz lint         # ray lint
pnpm --filter bananasplitz check-types  # tsc --noEmit
pnpm --filter bananasplitz test         # vitest
pnpm --filter bananasplitz check-parity # CLI ↔ Raycast tool name parity
```

Before publishing:

```bash
pnpm --filter bananasplitz stage        # build .publish-stage/ only
pnpm --filter bananasplitz stage:verify # stage + npm install + ray lint + ray build
pnpm --filter bananasplitz dry-run      # full pre-publish validation (manifest, lockfile, screenshots, parity)
pnpm --filter bananasplitz publish      # dry-run + ray publish from .publish-stage/
```

Screenshots are captured locally inside `metadata/` — see [`metadata/README.md`](./metadata/README.md) for the capture checklist.

## Publishing

The Raycast Store is not a registry — every extension lives as a folder inside the public [`raycast/extensions`](https://github.com/raycast/extensions) repo, and "publishing" means opening a PR there. `npx @raycast/api publish` automates that: it forks `raycast/extensions`, pushes the staged extension into a branch on your fork, and opens the contribution PR. A Raycast reviewer merges it and the store picks it up on its next sync.

### One-time setup (only needed for the CI publish path)

Publishing from your laptop needs nothing extra — `pnpm --filter bananasplitz publish` uses your interactive `gh`/git auth. The setup below is only for the `workflow_dispatch` CI publish job.

1. **Mint a GitHub PAT** at <https://github.com/settings/tokens/new>:
   - Note: `Raycast publish — banana-split-tma`
   - Scope: the top-level `repo` checkbox (needed to fork, push to the fork, and open a PR on the public `raycast/extensions`). `workflow` scope is **not** needed — the contributed extension carries no Actions config.
2. **Create a GitHub Environment** at <https://github.com/bubuding0809/banana-split-tma/settings/environments>:
   - Name it `raycast-publish` (exact — the workflow references this name).
   - Optionally add yourself as a **Required reviewer** to gate the publish job behind a manual approval.
3. **Add the secret** in that environment: name `RAYCAST_GH_TOKEN`, value the PAT from step 1. The publish job fast-fails if it is missing.

### Per-release checklist

1. Confirm `package.json` `author` matches your Raycast username (`raycast.com/<username>`), or the contribution PR is auto-rejected.
2. Ensure 3–6 screenshots exist in `metadata/` (`bananasplitz-1.png` … `bananasplitz-6.png`). See [`metadata/README.md`](./metadata/README.md).
3. Replace any `{PLACEHOLDER}` token in `CHANGELOG.md` (e.g. `{PR_MERGE_DATE}`) with the real value — `dry-run` blocks on unfilled placeholders.
4. Run `pnpm --filter bananasplitz dry-run` locally and confirm it is green.
5. Publish via **one** of:
   - **Local:** `pnpm --filter bananasplitz publish`
   - **CI:** Actions → `Raycast` workflow → `Run workflow` → branch `main`, mode `publish`. Approve the environment gate if you configured required reviewers.
6. Watch the contribution PR on `raycast/extensions` (the CLI prints its URL) and respond to any reviewer feedback there.

## Links

- [Banana Split mini-app](https://t.me/BananaSplit_bot)
- [Source repository](https://github.com/bubuding0809/banana-split-tma)
- [Issue tracker](https://github.com/bubuding0809/banana-split-tma/issues)
