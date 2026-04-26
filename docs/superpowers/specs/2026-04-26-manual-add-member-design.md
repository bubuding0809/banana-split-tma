# Manual Add Member — Wire TMA → Bot Deep Link

**Date:** 2026-04-26
**Status:** Brainstorm complete — awaiting user spec review
**Author:** Ruoqian Ding (with Claude Opus 4.7)

## Goal

Wire the placeholder "Add Member" button in the TMA's Members
sub-page to the existing — and already working — bot-side
`/start ADD_MEMBER<chatId>` flow, so a chat member can pick people
from their Telegram contacts and onboard them into the chat without
those people having to open the TMA themselves.

The headline problem this addresses:

> Telegram bots can't list group members unless they're admins.
> Users have to open the TMA themselves to be registered to the
> group. Some users miss that prompt.

The bot already exposes a working contact-picker flow via
`KeyboardButtonRequestUsers` (multi-select up to 10, returns name +
username, no phone number). This spec covers the **TMA wiring** plus
**three small bot-side improvements** to close the loop.

## Why bot deep-link, not in-TMA search

Decided during brainstorm. Summary of trade-offs:

| | Bot DM `requestUsers` | In-TMA search |
|---|---|---|
| Works for users *not yet in the User table* | ✅ | ❌ — requires prior bot interaction |
| Already implemented | ✅ — `apps/bot/src/features/user.ts:9-48,182-245` | ❌ — would need new procedures + page |
| Native Telegram contact picker | ✅ | ❌ — custom search list |
| Requires leaving the TMA | yes (~3s round-trip) | no |

Headline use case is *"add people who haven't opened the TMA yet"*
— exactly the population that won't be in the User table and
therefore can't be found via in-TMA search. Bot deep-link is the
only flow that covers it.

## Constraints

- **No new tRPC procedures.** `chat.addMember` already does the right
  thing for the bot's authenticated calls
  ([addMember.ts](packages/trpc/src/routers/chat/addMember.ts)).
- **No schema changes.** No new tables, no new columns.
- **TMA piece is one component rewrite.** `AddMemberSheet.tsx`
  changes from a placeholder to a real CTA.
- **Bot piece is additive.** Three targeted edits in one file
  (`apps/bot/src/features/user.ts`) plus a couple of message-string
  updates.

## Non-goals

- In-TMA user search across the User table (deferred — covers a
  narrower case at significant cost).
- Letting non-members of a chat add members (membership guard
  intentionally rejects).
- Telegram-admin-only restriction (any chat member can add, matching
  today's flow).
- Bulk paste of `@usernames` for fully-novel users (the
  `requestUsers` keyboard already covers this case natively).
- Realtime push when members are added (we refresh on TMA visibility
  change, no Pusher/etc.).

## Surfaces

### 1. TMA — `AddMemberSheet.tsx` rewrite

`apps/web/src/components/features/Settings/AddMemberSheet.tsx`

**Replace** the "coming soon" placeholder content with a real
explainer + CTA. Brief is intentional — we don't want to over-explain
a 2-tap flow.

**Props change:**

```ts
interface AddMemberSheetProps {
  chatId: number;          // NEW — needed to build deep link
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
```

**Behavior:**

- Sheet body: short copy — *"We'll open the bot DM where you can pick
  people from your Telegram contacts. They'll be added to this group."*
- Primary button "Open bot DM" → light haptic →
  `openTelegramLink(\`${import.meta.env.VITE_TELEGRAM_BOT_DEEP_LINK}?start=ADD_MEMBER${chatId}\`)`
  → `onOpenChange(false)`. The `openTelegramLink` call closes the TMA
  on its own (Telegram's behavior when navigating to a `t.me` URL).
- Secondary button "Cancel" → `onOpenChange(false)`.
- Reuse existing `Modal` + `Section` + `Button` patterns already in
  the file.

**Why a sheet, not a direct link from `MembersSubPage`:** the TMA
closing without warning is jarring. The brief sheet sets context for
users who don't yet know the bot has a contact-picker flow. One extra
tap, large clarity payoff.

**Identical pattern already shipped:** `NewUserPage.tsx:31-33` calls
`openTelegramLink` against the same env var.

### 2. TMA — `MembersSubPage.tsx` updates

`apps/web/src/components/features/Settings/MembersSubPage.tsx`

Three changes:

1. **Pass `chatId`** to `AddMemberSheet`.
2. **Update Section footer copy** — drop the "Coming soon" line.
   New copy: *"Tap 'Add Member' to pick people from your Telegram
   contacts via the bot."*
3. **Refresh on visibility change.** When the user returns from the
   bot DM, the members list should reflect new entries. Add a
   `useEffect` that listens to `document.visibilitychange` and calls
   `utils.chat.listMembers.invalidate({ chatId })` when the document
   becomes visible. tRPC's util hook is the canonical way to trigger
   a refetch in this codebase.

```ts
useEffect(() => {
  const onVisible = () => {
    if (document.visibilityState === "visible") {
      utils.chat.listMembers.invalidate({ chatId });
    }
  };
  document.addEventListener("visibilitychange", onVisible);
  return () => document.removeEventListener("visibilitychange", onVisible);
}, [chatId]);
```

### 3. Bot — membership guard in `users_shared`

`apps/bot/src/features/user.ts`, the `userFeature.on("message:users_shared", ...)` handler.

**Insert before any user processing** (right after the
`groupIdStr` is read from session):

```ts
try {
  const requesterMember = await ctx.api.getChatMember(
    groupIdStr,
    ctx.from!.id,
  );
  if (
    requesterMember.status === "left" ||
    requesterMember.status === "kicked"
  ) {
    throw new Error("not-a-member");
  }
} catch {
  ctx.session.addMemberGroupId = undefined;
  await ctx.reply(BotMessages.ADD_MEMBER_NOT_A_MEMBER, {
    reply_markup: { remove_keyboard: true },
  });
  return;
}
```

**Why:** today, anyone who knows or guesses a `chatId` can craft
`https://t.me/<bot>?start=ADD_MEMBER<chatId>` and inject members. Risk
is low (chat IDs aren't enumerable; `chat.addMember` requires a known
user) but it's a real gap. Telegram's `getChatMember` returns
`left`/`kicked` for non-members — we treat both as "not a member"
and abort. We also handle the throw case (e.g., bot was removed from
the group) as "can't verify, treat as not a member" to fail closed.

### 4. Bot — improved success message

`apps/bot/src/features/user.ts` — same handler, after the loop.

Append a "Open *<chat title>* in the app" line with a deep link to
the chat's TMA, built via the existing
[`ChatUtils.createMiniAppUrl`](apps/bot/src/utils/chat.ts:15) helper
(which substitutes `{botusername}`, `{mode}`, `{command}` into
`MINI_APP_DEEPLINK`). Use the chat-context encoded via
`ChatUtils.createChatContext` — already used elsewhere for the same
purpose.

**Source of `chatTitle` at this point:** the existing `/start`
handler fetches it via `getChat(groupIdStr)` and uses it in the
prompt message, but does not persist it. By the time `users_shared`
fires (a different message), we have only the `groupIdStr` from
session. Two clean options:

1. **Re-fetch in the handler.** Call `ctx.api.getChat(groupIdStr)`
   again and read `title`. One extra API call but no session-shape
   change.
2. **Persist in session.** Extend the bot session shape to include
   `addMemberGroupTitle?: string` and write both at `/start` time.

Going with **option 1** (re-fetch). Bot session changes have a
slightly higher surface area (every middleware that touches session
needs to handle the new field), and the API call is cheap. We're
already doing one round-trip for the membership guard
(`getChatMember`); doing a second `getChat` is in the noise.

```ts
const command = ChatUtils.createChatContext(BigInt(groupIdStr), "supergroup");
const miniAppUrl = ChatUtils.createMiniAppUrl(
  config.MINI_APP_DEEPLINK,
  ctx.me.username,
  command,
);

const keyboard = new InlineKeyboard().url(
  `Open ${chatTitle} in app`,
  miniAppUrl,
);

await ctx.reply(resultText, {
  reply_markup: keyboard,
});
```

(Note: the existing `remove_keyboard` and the new inline keyboard
need to be reconciled — send a follow-up message with the inline
button rather than trying to merge reply-keyboard removal with an
inline keyboard in the same message.)

### 5. Bot — DM each added user

`apps/bot/src/features/user.ts` — same handler, inside the per-user
loop, **after** a successful `chat.addMember`.

For each successfully-added user:

```ts
try {
  await ctx.api.sendMessage(
    user.user_id,
    BotMessages.ADD_MEMBER_NOTIFY_USER
      .replace("{adder_first_name}", escapeMarkdownV2(ctx.from!.first_name))
      .replace("{chat_title}", escapeMarkdownV2(chatTitle)),
    {
      parse_mode: "MarkdownV2",
      reply_markup: new InlineKeyboard().url(
        `Open ${chatTitle}`,
        miniAppUrl,
      ),
    },
  );
} catch (err) {
  // Forbidden: bot can't initiate a conversation with the user
  // (target has never DM'd the bot). Expected — swallow silently.
  console.warn("Could not DM added user", user.user_id, err);
}
```

**Important:** Telegram bots **can only DM users who have previously
started a chat with the bot.** If the target user has never opened
the bot DM (most likely case for our headline scenario — they missed
the original prompt), the API returns
`Forbidden: bot can't initiate conversation with a user`. We swallow
that error and the success list still includes them. Their
notification surface in this case is *the next time they open the
bot DM in any context* (the bot will see them as a known user
already).

This is a best-effort feature. It closes the loop for users who have
DM'd the bot before but not opened *this specific* chat's TMA — a
common case for repeat group users.

### 6. Bot — message strings

`apps/bot/src/features/messages.ts`

Three new/updated constants:

```ts
ADD_MEMBER_END_MESSAGE: "Added: {success_list}\nFailed: {failed_list}",
// no change to body — the inline-keyboard goes on the message
// itself, no template change needed.

ADD_MEMBER_NOT_A_MEMBER:
  "❌ You can only add members to groups you're a member of.",

ADD_MEMBER_NOTIFY_USER:
  "👋 *{adder_first_name}* added you to *{chat_title}* on Banana Splitz\\.\n\n" +
  "Open the app to see shared expenses and start splitting\\.",
```

## Edge cases

| Case | Behavior |
|---|---|
| User cancels picker via "❌ Cancel" button | Existing handler (`userFeature.hears(BotMessages.ADD_MEMBER_CANCEL_BUTTON, ...)`) clears session and removes keyboard. No-op. |
| User shares themselves | `chat.addMember` returns `CONFLICT` (already a member); counted in `failed`. Cosmetic. |
| User shares someone already in the chat | Same `CONFLICT` path. |
| User shares a Telegram bot account | Telegram's `requestUsers` defaults to `user_is_bot: false`; bots excluded by Telegram itself. We don't need to filter. |
| Bot can't fetch chat title (private group with no title) | Existing fallback `"the group"` applies; deep-link `chatTitle` substitution shows "the group" in CTA. |
| Requester left the group between deep-link tap and contact share | New membership guard rejects with `ADD_MEMBER_NOT_A_MEMBER`. |
| Bot was removed from the group | `getChatMember` throws → caught and treated as "not a member" (fail-closed). |
| Bot can't DM an added user (target never DM'd bot) | `Forbidden` caught and swallowed. Success list still includes them. |
| Session expires between deep-link and contact share | Existing handler already says *"Session expired. Please start the add member process again."* |
| User opens the deep link from the bot DM where they have no chat session | The session is per-bot-DM; the start handler fetches chat info + sets session per-message, so this just works. |
| TMA is open in the background while user adds via bot | Visibility-change refetch in `MembersSubPage` updates the list when user returns. |

## Test plan

### Component smoke (no UAT, fast)

- `AddMemberSheet`: renders with new copy, primary button calls
  `openTelegramLink` with the correct URL, secondary button closes
  the sheet.
- `MembersSubPage`: passes `chatId` prop to sheet; visibility-change
  listener calls `invalidate` exactly once per visible→hidden→visible
  cycle.

### Manual UAT — full lifecycle (per project convention)

Per the *full-environment UAT loop* preference, this is one cycle
covering create + verify + cleanup. The lambda firing concern from
the recurring-expense work doesn't apply here (no scheduler), but
the principle of "exercise the whole flow, not just the submit" does.

**Subagent UAT (programmable):**

- DB audit before flow: `User` rows for the test target users (some
  pre-existing, at least one fresh).
- After successful flow: confirm `_ChatMembers` rows for each added
  user, `User` rows for any new ones.
- Cleanup: subagent removes the test members and any User rows it
  created.

**Manual UAT (user, via `AskUserQuestion` walkthrough):**

1. *Happy path:* From TMA → Settings → Members → tap "Add Member" →
   sheet opens → tap "Open bot DM" → bot DM opens with picker
   prompt → pick 2 contacts → see success message in bot DM with
   the new "Open *<chat>* in app" button → tap it → land back in TMA
   on the chat's home page → navigate back to Settings → Members →
   verify new members appear (visibility refetch).
2. *Notification path:* if one of the added users has previously
   DM'd the bot, verify they receive a "you've been added" message
   with Open App button. Visual check: emoji, MarkdownV2 escaping,
   button label.
3. *Notification swallow:* add a fresh user (never DM'd the bot).
   Confirm: bot's success message in adder's DM still lists them as
   added; no error surfaces; the new user has no DM (expected).
4. *Membership guard:* manually craft a
   `https://t.me/<bot>?start=ADD_MEMBER<chatId-not-a-member-of>`
   link, tap it. Confirm bot rejects with the "you can only add
   members to groups you're a member of" message and removes the
   keyboard.
5. *Cancel:* start the flow, tap the "❌ Cancel" keyboard button.
   Confirm session is cleared (existing flow), keyboard removed,
   re-tapping "Add Member" in TMA still starts a fresh flow.
6. *TMA refresh:* keep TMA open in background while completing the
   flow in bot DM, swipe back to TMA. Confirm members list updates
   automatically without a manual refresh.

## File map

```
apps/bot/src/features/messages.ts          edit  +2 strings
apps/bot/src/features/user.ts              edit  +membership guard
                                                  +inline-keyboard send
                                                  +per-user DM swallow
apps/web/src/components/features/Settings/
  AddMemberSheet.tsx                       rewrite  placeholder → real CTA
  MembersSubPage.tsx                       edit  +chatId prop
                                                  +visibility refetch
                                                  -coming-soon copy
```

No new files. No schema changes. No new tRPC procedures.
