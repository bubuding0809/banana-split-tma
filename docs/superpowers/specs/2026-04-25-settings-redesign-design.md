# Settings Redesign — Hub & Spoke

**Date:** 2026-04-25
**Status:** Brainstorm complete — awaiting user spec review
**Author:** Ruoqian Ding (with Claude Opus 4.7)

## Goal

Replace today's monolithic `/chat/$chatId_/settings` page (six stacked
sections, two of them confusingly both named "Notifications") with an
iOS / Telegram-iOS hub-and-spoke layout: a clean menu hub and one
focused sub-page per concern.

The redesign also adds two missing pieces:

1. **Members sub-page** — there's currently no way to see who is in
   the chat from the bot's perspective. Adds a roster plus a
   placeholder "Add Member" entry that will later trigger Telegram
   user-sharing via the bot DM.
2. **Required token names** — `ChatApiKey` and `UserApiKey` rows are
   indistinguishable today. Each token gets a required name so users
   can tell their CLI from their agent from their teammate's setup.

## Constraints

- **Telegram Mini App.** Components from `@telegram-apps/telegram-ui`
  (`Section`, `Cell`, `ButtonCell`, `Switch`, `Modal`); icons from
  `lucide-react`; haptics via `@telegram-apps/sdk-react`.
- **Backbutton-aware.** Each sub-page registers `backButton.show()`
  / `onClick(navigate up)` like `ChatSettingsPage` does today.
- **Both private and group chats.** The hub adapts: private chats
  hide Members, Event alerts, and Recurring reminder rows.
- **No new external dependencies.** Solid-color icon squares are
  built with Tailwind utilities, not a new icon-square component
  library.

## Non-goals

- Member detail view, member admin/role management, removing
  members, or showing per-member balance in the roster. Members
  page is read-only beyond the "Add Member" placeholder.
- Wiring the actual "Add Member" → Telegram-share-contact flow.
  This spec ships the cell as a "Coming soon" sheet; the bot-DM
  flow is a separate follow-up.
- Tracking `lastUsedAt` on tokens. Mockups hint at "Last used 2h
  ago" but the schema has no such column today; we do not add it
  in this spec. Token cards show `Created` only.
- Changing any of the existing sub-flows the hub links into:
  `/settings/categories` route tree, `EditChatCategoryPage`,
  `OrganizeCategoriesPage`, `EditReminderScheduleModal` all keep
  their current behavior. Only the entry points change.
- Currency selection logic. We move it from a modal triggered on
  the hub into its own sub-page, but the search/filter behavior
  inside `CurrencySelectionModal` is reused as-is.

## Visual language

iOS / Telegram-iOS settings, applied consistently:

- **Chat header** at the top of the hub: 88px circular avatar
  (chat photo), chat title, "Group · N members" or "Personal
  chat" subtitle, and a stacked-mini-avatar member preview
  (group only).
- **Solid-color icon squares.** 28×28 rounded squares, white
  glyph, one solid color per row (blue, green, orange, purple,
  red, gray, etc.). Not pastel, not theme-link-color circles.
- **Grouped sections.** Tiny uppercase gray header (e.g.,
  `GROUP`, `NOTIFICATIONS`, `PERSONAL`), inset 16px from the
  edge. Sections separated by background gaps, not full-width
  dividers.
- **Add actions follow the snapshot pattern.** A
  `<ButtonCell before={<Plus />}>` at the top of the same
  Section as the list — blue label using
  `themeParams.buttonColor`, no green-circle icon.

The visual companion mockups for hub + every sub-page are in
`.superpowers/brainstorm/39308-1777126775/content/`
(`hub-with-members.html`, `all-subpages-v2.html`,
`token-naming.html`). The accompanying deck
(`2026-04-25-settings-redesign-deck.html`) carries the same
mockups co-located with this spec.

## Routes

All routes live under `/_tma/chat/$chatId_/settings`. The existing
layout file (`chat.$chatId_.settings.tsx`) already renders an
`<Outlet />`, so adding sub-routes is purely additive.

| Route | Purpose | Status |
|-------|---------|--------|
| `/settings/` (index) | Hub | Replaces today's `ChatSettingsPage` content |
| `/settings/members` | Member roster + add placeholder | **NEW** |
| `/settings/currency` | Currency picker | **NEW** (lifts modal into sub-page) |
| `/settings/categories` | Category management entry | Exists; restyled hub-side card |
| `/settings/categories/...` | Manage / new / organize / edit | Unchanged |
| `/settings/notifications` | Event-alert toggles | **NEW** (extracted) |
| `/settings/reminders` | Recurring reminder toggle + schedule | **NEW** (extracted) |
| `/settings/account` | Phone number + future personal settings | **NEW** (extracted) |
| `/settings/developer` | API tokens (create/rename/revoke) | **NEW** (extracted) |

Search-param schema on the parent `settings.tsx` (`prevTab`)
stays. Sub-routes inherit and use it for back navigation.

## Hub

### Layout

```
[ < Back ] Settings

  ⬤ chat avatar (88px)
  Banana Split Trip
  Group · 4 members
  [RD][JS][AM][+1]   ← member-avatar stack (group only)

GROUP
  👥  Members             4              ›
  $   Currency            SGD            ›
  🏷  Categories          12 · 3 custom  ›

NOTIFICATIONS
  🔔  Event alerts        3 on           ›
  ⏰  Recurring reminder  Sun 9pm        ›

PERSONAL
  👤  Account             Phone added    ›
  🔑  Developer                          ›
```

For private chats, the layout collapses to:

```
PERSONAL
  $   Currency            SGD            ›
  🏷  Categories          5 · 0 custom   ›
  👤  Account             Phone added    ›
  🔑  Developer                          ›
```

### Right-side previews

Each row shows a one-glance summary:

- Members: count
- Currency: ISO code
- Categories: `${visibleCount} · ${customCount} custom` or `0 custom`
- Event alerts: `N on` (count of enabled toggles)
- Recurring reminder: `Sun 9pm` when enabled, `Off` when disabled
- Account: `Phone added` / `No phone`
- Developer: token count, e.g., `2 active`

### Member-avatar stack

Up to four avatars, last is "+N" overflow chip when there are more
than four members. Tappable as a shortcut to the Members sub-page
(same target as the menu row). Avatar generation reuses whatever
helper we already use elsewhere for member chips — verify during
implementation; no new avatar pipeline.

## Sub-pages

### Members (NEW)

- Single section listing chat members.
- First row is a `ButtonCell` with `<Plus />` and label
  `"Add Member"` (theme button color). Tapping opens a sheet
  explaining the upcoming flow ("Share a contact with the bot in
  your private chat to add them here. Coming soon.") with a
  single dismiss button. No backend wiring beyond the sheet.
- Member rows: 40px circle avatar, full name, `@username` (or
  the muted text `"no username"` when null). Current user gets
  a small gray `"You"` pill on the trailing edge. Rows are
  non-tappable in v1 (reserved for future detail view).
- Footer: short copy explaining what the page is.

### Currency (NEW)

- Lifts `CurrencySelectionModal`'s list rendering into a
  sub-page. The modal component itself can stay; this page
  renders the same currency rows in a `Section` instead of a
  modal, then mutates `chat.updateChat` on tap.
- Two sections: "Selected" (single row, the current base
  currency, with a check mark on the right) and "All
  currencies" (everything else, alphabetical by name).
- Reuses the existing flag-URL helper (`getFlagUrl`).
- On tap, `hapticFeedback.notificationOccurred("success")`,
  optimistic update via the same `updateChatMutation` pattern,
  then **stay on the page** — the user navigates back manually
  (iOS Settings convention). Revisit if it feels slow during
  UAT.

### Categories (existing routes restyled)

- Sub-page is the container previously rendered inline by
  `CategoriesSection`. Three blocks:
  1. **Action card** with two cells: `Manage` (links to
     existing `/settings/categories` index) and `Reorder`
     (links to `/settings/categories/organize`).
  2. **Preview tile grid** (existing `CategoryTile` 4×n preview).
  3. **Footer** copy ("Shared by everyone in this group." vs
     "Categories are private to this chat.").
- Optional: a `+ Add Category` `ButtonCell` at the top of the
  action card linking to `/settings/categories/new`. Today the
  flow is "tap Manage → tap +", which is two taps; the shortcut
  is one. Include in v1 for consistency with other sub-pages.

### Notifications — Event alerts (extracted)

- Single section with three `Cell` rows (Expense added, Expense
  updated, Settlement recorded), each with an inline `Switch`
  bound to the same `updateChatMutation` handlers we have
  today. No behavior change — just isolated.
- Footer copy carries over: "Reminders you send manually are
  unaffected by these settings."

### Notifications — Recurring reminder (extracted)

- "Status" section: one toggle row (`Enabled`) wired to the
  existing `aws.updateGroupReminderSchedule` mutation.
- "Schedule" section (only when enabled): one `Cell` showing
  "Every {dayOfWeek}, {time}" + timezone subtitle, opening
  `EditReminderScheduleModal` on tap. The modal component is
  unchanged.
- Footer copy explains what the reminder does.

### Account (extracted)

- Top: small profile header (60px avatar, full name,
  `@username`). Reuses the `tUserData` signal already in
  `ChatSettingsPage`.
- "Contact" section: phone-number cell. Tap to add (when
  empty, Telegram contact-share via existing `useRequestContact`
  hook); shows the number when set, no chevron.
- Destructive "Remove phone number" in a separate trailing
  card (iOS pattern), only when the phone is set.
- Footer copy: "Only used so the bot can recognize you across
  chats."
- Visible in both private and group chats; same content.

### Developer (extracted)

- Section "API access" containing:
  - `+ Generate new token` `ButtonCell` (opens create sheet, see
    Token naming below).
  - One token card per active token. Card layout:
    - Token name (large, primary text).
    - Created date (small, gray). No "last used" — schema
      doesn't track it today.
    - Masked key string in a monospace pill (`bs_••••••••••a3f1`).
    - "Revoke" link (destructive red), opens existing
      confirmation `confirm()` flow. Migration to a proper
      Telegram-UI confirm sheet is out of scope here.
- Tapping anywhere else on a token card opens the **edit sheet**
  (rename or revoke from one place — see Token naming).
- Setup-guide modal (the agent-prompt copy flow currently in
  `AccessTokensSection`) stays available — surfaced as a small
  link/cell at the bottom of the section ("Setup guide for
  agents").
- For private chats, the page wires up to `UserApiKey`
  endpoints; for group chats, `ChatApiKey`. Behavior parity
  with today's `UserAccessTokensSection` /
  `AccessTokensSection`.

## Token naming feature

### Schema

Add a required name column to both token tables:

```prisma
model ChatApiKey {
  // ... existing fields
  name        String   // NEW, NOT NULL
}

model UserApiKey {
  // ... existing fields
  name        String   // NEW, NOT NULL
}
```

### Migration

Two-step migration to make NOT NULL safe under existing rows:

1. Add column nullable, back-fill existing rows with
   `"Token · ${MMM DD}"` derived from `createdAt` (server-side
   DEFAULT or migration script). For ChatApiKey and UserApiKey
   alike.
2. Set NOT NULL.

This must run before the new generate/rename mutations are
deployed, or any new generate without a name will fail
validation. Plan it as a pre-deploy migration step.

### tRPC

- **Modify** `apiKey.generateToken` (chat) and the analogous
  user-token endpoint to require `name: z.string().trim().min(1).max(40)`.
- **Add** `apiKey.renameToken({ chatId, tokenId, name })` and
  the user-token equivalent. Same validation.

### UI flow

- `+ Generate new token` → bottom sheet with one text input
  ("Name", required, placeholder `"e.g., CLI on Macbook"`),
  Cancel + Create buttons. Create disabled until the field is
  non-empty after trim. On success, the existing "show raw key
  + copy" modal opens as before.
- Tapping a token row → edit sheet with the same single text
  input pre-filled, plus a destructive Revoke button (with the
  current confirm dialog) and a primary Save button. Save calls
  `renameToken`; Revoke calls the existing revoke flow.

Both sheets use Telegram-UI `Modal` for component consistency.

## Component & file changes

New files (`apps/web/src/`):

- `routes/_tma/chat.$chatId_.settings.members.tsx`
- `routes/_tma/chat.$chatId_.settings.currency.tsx`
- `routes/_tma/chat.$chatId_.settings.notifications.tsx`
- `routes/_tma/chat.$chatId_.settings.reminders.tsx`
- `routes/_tma/chat.$chatId_.settings.account.tsx`
- `routes/_tma/chat.$chatId_.settings.developer.tsx`
- `components/features/Settings/SettingsHubPage.tsx` (new hub)
- `components/features/Settings/MembersSubPage.tsx`
- `components/features/Settings/CurrencySubPage.tsx`
- `components/features/Settings/EventAlertsSubPage.tsx`
- `components/features/Settings/RecurringReminderSubPage.tsx`
- `components/features/Settings/AccountSubPage.tsx`
- `components/features/Settings/DeveloperSubPage.tsx`
- `components/features/Settings/TokenNameSheet.tsx` (shared between create + rename)
- `components/features/Settings/MemberRow.tsx`
- `components/features/Settings/ChatHeader.tsx` (avatar + title + member-stack block)

Modified:

- `routes/_tma/chat.$chatId_.settings.index.tsx` — render
  `SettingsHubPage` instead of `ChatSettingsPage`.
- `packages/database/prisma/schema.prisma` — add `name` columns,
  generate migration.
- `packages/trpc/src/routers/apiKey/...` — update generate
  procedures, add rename procedures.
- Token-card UI extracted from `AccessTokensSection.tsx`.

Deleted (replaced by sub-pages):

- `components/features/Settings/ChatSettingsPage.tsx` — content
  redistributed.
- `components/features/Settings/CategoriesSection.tsx`,
  `RecurringRemindersSection.tsx`,
  `AccessTokensSection.tsx`, `UserAccessTokensSection.tsx` —
  contents move into respective sub-pages. Worth keeping the
  files only if they're imported elsewhere; otherwise delete.

## Testing & UAT

### Automated (subagent-driven)

- tRPC: generate-token rejects empty name, trims, enforces 40
  char max. Rename-token enforces same validation, rejects
  cross-chat tokenIds.
- Migration: existing tokens back-fill to `Token · {date}`,
  column becomes NOT NULL afterward.
- Members listing: returns chat members with id / firstName /
  lastName / username; respects chat membership (cross-chat
  fetch returns 403/empty).

### Manual (per memory: AskUserQuestion walkthrough)

For UI-facing work — Telegram rendering, TMA navigation, haptics,
visual styling — I'll walk through these per memory:

1. Hub renders with chat header, member-avatar stack, three
   sections.
2. Tap each menu row → correct sub-page; back button returns
   to hub.
3. Private chat hub omits Members, Event alerts, Recurring
   reminder.
4. Members page: roster, "You" pill, "Add Member" sheet.
5. Currency page: pick a new currency, hub preview updates.
6. Event alerts toggles persist + bot stops/starts notifying.
7. Recurring reminder toggle + edit-schedule modal flow.
8. Account: add phone, remove phone, both via Telegram contact
   share.
9. Developer (group): generate token with name, copy key,
   rename, revoke.
10. Developer (private/personal): same flow against
    `UserApiKey`.

### Pre-merge

- TypeScript build clean across `apps/web` and `packages/trpc`.
- Existing route tree generation (`tanstack-router`) regenerated.
- Prisma migration generated and committed.
- No regressions on the existing `/settings/categories/*`
  flows.

## Open questions

None blocking. Items to revisit during implementation:

- Whether the hub's member-avatar stack should pin "you" first
  vs show the four most recent.
- ~~Whether the Categories sub-page is worth keeping, given it
  just trampolines into existing routes.~~ **Resolved during
  implementation:** the hub navigates straight to the existing
  `/settings/categories` index (`ManageCategoriesPage`). No
  trampoline page added — drops a redundant level of indirection
  and keeps the existing categories CRUD flow unchanged.
