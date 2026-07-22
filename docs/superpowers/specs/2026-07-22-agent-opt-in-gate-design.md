# Per-Group AI Agent Opt-In Gate — Design

**Date:** 2026-07-22
**Status:** Approved

## Problem

The bot's AI agent (mentions, replies, `/ask`, `/do`) is enabled for every group by default. The feature is experimental and flaky. Groups should opt in explicitly; by default the agent must not trigger.

## Decisions (user-confirmed)

- **Scope:** group chats only. Private DMs keep the agent always-on.
- **Disabled behavior:** silent ignore. No hint reply when a user mentions the bot or runs `/ask` in a gated group.
- **UI:** new "Bot" subpage under the Group section of TMA group settings, holding the AI toggle.
- **Default:** disabled for all groups, including existing ones.

## Approach

Boolean column on `Chat`, following the existing per-chat toggle pattern (`debtSimplificationEnabled`, `notifyOn*`). Rejected alternatives: a generic `ChatFeatureFlag` table (overkill for one flag, no existing pattern) and an env allowlist (no user self-serve opt-in).

## Components

### 1. Database (`packages/database`)

- `Chat.agentEnabled Boolean @default(false)` + migration.
- Existing rows get `false` — every group starts gated.
- Private chats also have `Chat` rows; the column is present but never read on the DM path.

### 2. tRPC (`packages/trpc`)

- `getChat` output: add `agentEnabled` (boolean, default `false` when chat missing).
- `updateChat`: add optional `agentEnabled` to input schema, update-data plumbing, and output schema. Access control unchanged (`assertChatAccess` — any group member can toggle, same as every other group setting).

### 3. Bot gate (`apps/bot`)

Gate every group-side entry into `handleAgentMessage`:

- `group.ts` message handler (mention / reply-to-bot, `group.ts:238`): before invoking the agent, fetch the chat via `ctx.trpc.chat.getChat` and return silently when `agentEnabled` is false.
- `agent.ts` `/ask` and `/do` commands: same check when `ctx.chat.type !== "private"`.
- Private DM auto-handling (`agent.ts:387`) untouched.
- Gated skips log `agent.gated` at info level for observability.
- Lookup happens only on messages that would trigger the agent (mention/reply/command), not on every group message.

### 4. TMA UI (`apps/web`)

- Settings hub (`SettingsHubPage.tsx`): new RowLink "Bot" in the **Group** section (groups only), preview value "AI on" / "AI off", navigating to the new subpage.
- New route `/chat/$chatId/settings/bot` + `BotSettingsSubPage` component: one `Switch` cell "AI assistant" with a short description of what it enables, built from `@telegram-apps/telegram-ui` components following the Event alerts subpage pattern (optimistic `updateChat` mutation, haptics, back button).

### Out of scope

CLI, Raycast, and MCP surfaces are unchanged. The tRPC field is available to them but no UI/commands are added (avoids CLI version-bump churn).

## Error handling

- Bot gate: if the `getChat` lookup fails, fail closed (treat as disabled) and log the error — a flaky experimental feature should not fire on error.
- TMA toggle: standard mutation error path (existing pattern — revert optimistic state on error).

## Testing

- `updateChat` handler test: `agentEnabled` round-trips; omitted field leaves value unchanged.
- Bot gating tests: mention in gated group → no agent call; mention in opted-in group → agent call; `/ask` gated in group, allowed in DM; lookup failure → no agent call.
- Manual UAT (user, per-surface): toggle in TMA, mention bot in gated group (expect silence), enable, mention again (expect response), DM unaffected.
