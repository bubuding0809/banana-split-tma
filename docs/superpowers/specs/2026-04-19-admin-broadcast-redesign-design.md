# Admin Broadcast Redesign — Design Spec

**Date:** 2026-04-19
**Branch:** `feat/admin-broadcast-redesign`
**Scope:** `apps/admin` (and one small cleanup in `packages/trpc`)

## 1. Goals & Non-goals

### Goals
- Rebuild `apps/admin/src/components/BroadcastDashboard.tsx` using shadcn/ui primitives.
- Apply Emil Kowalski's design philosophy: quiet, considered, restrained color, thoughtful motion.
- Add a live Telegram-style preview panel, visible while composing.
- Add username/name search when picking specific users.
- Replace native `window.confirm` / `window.alert` with a shadcn `Dialog` and Sonner toasts.

### Non-goals (explicitly deferred)
- Message templates.
- Schedule send.
- Broadcast history.
- Dark mode in the admin app.
- Server-side user search.
- Real-time broadcast progress streaming (backend sends serially with a 100 ms delay — UI shows indeterminate progress and a final summary).

## 2. Layout

Two-column split inside the single admin page:

- **Left (~55% width)** — Composer
  - Header: title ("Broadcast"), "Draft" badge.
  - `MDEditor` (existing `@uiw/react-md-editor`), unchanged semantics.
  - Hint line: "Markdown (MarkdownV2) is sent to Telegram as-is."
- **Right (~45% width)** — Telegram-style Preview
  - Dark sage/stone bubble canvas (per Style B).
  - Renders the current message as one or more bubbles, updates live as the user types.
  - Small footnote: "Approximate preview — Telegram MarkdownV2 rendering may differ."
- **Sticky footer bar** (full-width, across both columns)
  - Audience chip on the left (e.g., *All users · 42* or *Specific · 3*); clicking opens the audience popover.
  - Broadcast button on the right (primary, sage accent).

Responsive: below a `lg` breakpoint, columns stack vertically (Composer on top, Preview below, footer stays sticky).

## 3. Components

New directory: `apps/admin/src/components/broadcast/`.
shadcn primitives installed to `apps/admin/src/components/ui/` via `shadcn init` (new `components.json`).

| File | Responsibility |
| --- | --- |
| `BroadcastPage.tsx` | Owns state; renders layout; composes children. Replaces `BroadcastDashboard.tsx`. |
| `MessageComposer.tsx` | Wraps `MDEditor`; exposes value up via `onChange`. |
| `TelegramPreview.tsx` | Renders Markdown as Telegram-styled bubbles. |
| `AudienceBar.tsx` | Footer chip showing audience summary; opens `AudiencePopover`. |
| `AudiencePopover.tsx` | shadcn `Popover` + `Command` (cmdk). All/Specific toggle, search input, scrollable user list, clear action. |
| `BroadcastButton.tsx` | Primary CTA; owns "Sending…" state. |
| `ConfirmBroadcastDialog.tsx` | shadcn `Dialog` gating broadcast send. Shows recipient count + message preview snippet. |
| `FailuresDialog.tsx` | Lazy-opened Dialog listing `{userId, error}` entries from the mutation result. |

shadcn primitives used: `Button`, `Badge`, `Popover`, `Command`, `Dialog`, `Input`, `RadioGroup`, `Separator`, `ScrollArea`, `Toast` (via Sonner).

## 4. Data Flow

State owned by `BroadcastPage`:

```ts
type State = {
  message: string;
  targetMode: "all" | "specific";
  selectedUserIds: bigint[];
  confirmOpen: boolean;
  failuresOpen: boolean;
};
```

Queries/mutations reused unchanged:
- `trpc.admin.getUsers.useQuery()` — fetches the full user list (client-side filter for search).
- `trpc.admin.broadcastMessage.useMutation()` — same payload; on settle, show toast.

The deprecated `trpc.admin.testBroadcast` endpoint is removed (see §10).

## 5. Search Behavior

Inside `AudiencePopover`:
- shadcn `Command` input at top.
- Filter `users` client-side by case-insensitive substring match against `firstName`, `lastName`, or `username`.
- Currently selected users are pinned to the top of the list (regardless of filter).
- Footer row: selection count + "Clear selection" text button.
- No backend change. Client filter is acceptable because current `getUsers` already fetches the full list.

## 6. Preview Rendering

- Convert the editor value to sanitized HTML using `marked` + `DOMPurify` (both lightweight, standalone). Do not try to reuse MDEditor's internal renderer — its components are tightly coupled to the editor UI.
- Wrap rendered HTML in a styled bubble (sage/stone palette).
- Long messages split into multiple bubbles on blank-line separators, mirroring Telegram's behavior roughly.
- Footnote under the preview: "Approximate preview. Telegram MarkdownV2 rendering may differ."

## 7. Error & Feedback

| Situation | Handling |
| --- | --- |
| User clicks Broadcast | Open `ConfirmBroadcastDialog` with recipient count + first ~200 chars of message. |
| Confirm in dialog | Fire mutation; dialog closes; Broadcast button shows spinner + "Sending…"; composer disabled. |
| Mutation success | Sonner toast: "Sent to N users · M failed" (success variant if `failCount === 0`, warning otherwise). |
| `failCount > 0` | Toast exposes "View failures" action → opens `FailuresDialog` listing `{userId, error}`. |
| Mutation rejects (network/server) | Destructive toast: "Broadcast failed — <error.message>". |
| Empty message | Broadcast button disabled; inline hint under composer: "Write a message to enable broadcast." |
| `targetMode === "specific"` with 0 selected | Broadcast button disabled; hint in footer: "Select at least one user." |

All native `confirm` / `alert` removed.

## 8. Emil-style Details

- **Motion:** Framer Motion spring for Popover open, Dialog mount, and Preview bubble fade-in (subtle, ~150–250 ms). No overshoot.
- **Focus rings:** consistent `ring-2` sage with offset, visible on keyboard focus.
- **Palette:** warm stone neutrals (`stone-50` … `stone-900`) with a single sage accent (`#57665e`-ish) on primary actions, active pills, and focus. No drop shadows outside Popover/Dialog elevations.
- **Typography:** Inter via system fallback. Tighter letter-spacing on headings; default tracking on body. Numeric (user IDs, counts) should use tabular-nums.
- **Button polish:** hover = tonal bg shift only (no translate). Primary has a subtle inner highlight on hover. Loading states swap label with spinner + "Sending…".
- **Spacing:** generous — `gap-6` between major regions, `gap-3` within a group. No cramped rows.

## 9. Testing

**Automated (Vitest + React Testing Library)**
- `TelegramPreview.test.tsx` — renders plain text, bold, links, line breaks as separate bubbles.
- `AudiencePopover.test.tsx` — search filters list; selected users pinned; clear resets.
- `ConfirmBroadcastDialog.test.tsx` — blocks send until confirm; cancel closes.
- `BroadcastPage.test.tsx` — disabled-state gating (empty message, specific w/ 0 users); happy path with mocked tRPC.

**Manual UAT**
After implementation, walk the user through a step-by-step UAT via `AskUserQuestion` (one step at a time), covering: compose → preview updates → all-users flow → specific-users search + select → confirm dialog → success toast → simulated failure path.

## 10. Incremental Improvements in Existing Code

- Move broadcast-related components into `apps/admin/src/components/broadcast/` for clarity.
- Extract a `useUsers` hook wrapping the existing `trpc.admin.getUsers` query, so the audience popover and any future user-facing feature share the same source.
- **Delete** `packages/trpc/src/routers/admin/testBroadcast.ts` and its registration in `packages/trpc/src/routers/admin/index.ts`; no caller will remain after this redesign.

## 11. Implementation Order (high-level)

1. Initialize shadcn in `apps/admin` (components.json, base primitives).
2. Install Sonner, Framer Motion, cmdk (if not pulled by shadcn Command).
3. Scaffold `components/broadcast/` folder with empty components.
4. Port state + layout from `BroadcastDashboard` into `BroadcastPage`.
5. Build `TelegramPreview` and wire it to the composer.
6. Build `AudiencePopover` with search + pinning.
7. Build `ConfirmBroadcastDialog` + Sonner integration.
8. Apply Emil-style polish pass (motion, focus rings, typography).
9. Delete `testBroadcast` endpoint and stale code.
10. Write component tests.
11. Manual UAT with the user.
