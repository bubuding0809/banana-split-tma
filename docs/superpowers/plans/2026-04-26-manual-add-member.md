# Manual Add Member — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the placeholder TMA "Add Member" button to the existing bot-side `/start ADD_MEMBER<chatId>` contact-picker flow, plus three small bot-side improvements (membership guard, inline-keyboard back to TMA, best-effort DM to each added user).

**Architecture:** TMA stays a thin client — its only new responsibility is `openTelegramLink('?start=ADD_MEMBER<chatId>')` from a rewritten `AddMemberSheet`, plus a `visibilitychange` listener on `MembersSubPage` to invalidate `chat.listMembers` when the user returns from the bot DM. The bot-side `users_shared` handler in `apps/bot/src/features/user.ts` gets a membership guard (via `getChatMember`), an inline-keyboard back-to-TMA button on the success message (built with the existing `ChatUtils.createMiniAppUrl` helper), and a per-user DM notification wrapped in a `try/catch` that silently swallows `Forbidden` errors from Telegram (expected when the target user has never DM'd the bot).

**Tech Stack:** TypeScript, grammy (Telegram bot framework), `@telegram-apps/sdk-react`, `@telegram-apps/telegram-ui`, tRPC + React Query, Vitest, Playwright Component Testing.

**Spec:** `docs/superpowers/specs/2026-04-26-manual-add-member-design.md`

---

## Branch context

- Already on branch `docs/manual-add-member-spec` (created during brainstorming).
- Spec already committed at `c15e71c` ("docs: design spec for manual add-member feature").
- All implementation tasks below land on this same branch on top of that commit.
- The branch will be renamed to `feat/manual-add-member` before opening the PR (Task 8) so the PR title matches a `feat:` scope.

---

## File map (locked-in)

| File | Action |
|---|---|
| `apps/bot/src/features/messages.ts` | edit — add 2 string constants |
| `apps/bot/src/features/user.ts` | edit — extend `users_shared` handler with guard + inline keyboard + per-user DM |
| `apps/web/src/components/features/Settings/AddMemberSheet.tsx` | rewrite — placeholder → real CTA |
| `apps/web/src/components/features/Settings/AddMemberSheet.spec.tsx` | create — Playwright CT |
| `apps/web/src/components/features/Settings/MembersSubPage.tsx` | edit — pass `chatId` prop, drop "coming soon" copy, add `visibilitychange` listener |

No new tRPC procedures, no schema changes, no new routes.

---

### Task 1: Add new bot message constants

**Files:**
- Modify: `apps/bot/src/features/messages.ts:5-6` (add two new constants near the existing `ADD_MEMBER_*` group)

- [ ] **Step 1: Add the two new constants**

Edit `apps/bot/src/features/messages.ts`. Find the line:

```ts
  ADD_MEMBER_END_MESSAGE: "Added: {success_list}\nFailed: {failed_list}",
```

Insert two new constants directly **after** that line:

```ts
  ADD_MEMBER_NOT_A_MEMBER:
    "❌ You can only add members to groups you're a member of.",
  ADD_MEMBER_NOTIFY_USER:
    "👋 *{adder_first_name}* added you to *{chat_title}* on Banana Splitz\\.\n\n" +
    "Open the app to see shared expenses and start splitting\\.",
  ADD_MEMBER_OPEN_APP_BUTTON: "Open {chat_title} in app",
```

The third constant is the inline-button label used in Tasks 3 and 4. Putting it here keeps all add-member strings co-located.

- [ ] **Step 2: Run typecheck to verify nothing else broke**

Run: `pnpm --filter bot exec tsc --noEmit`
Expected: clean (no errors).

- [ ] **Step 3: Commit**

```bash
git add apps/bot/src/features/messages.ts
git commit -m "$(cat <<'EOF'
feat(bot): add string constants for add-member guard, notify, and back-to-app button

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Bot — membership guard in `users_shared` handler

**Files:**
- Modify: `apps/bot/src/features/user.ts:182-196` (the `users_shared` handler — insert guard right after `groupIdStr` is read)

- [ ] **Step 1: Read the current handler to confirm the insertion point**

The relevant block currently reads:

```ts
userFeature.on("message:users_shared", async (ctx, next) => {
  if (ctx.message.users_shared.request_id !== 1) {
    return next();
  }

  const groupIdStr = ctx.session.addMemberGroupId;
  if (!groupIdStr) {
    await ctx.reply(
      "Session expired. Please start the add member process again.",
      {
        reply_markup: { remove_keyboard: true },
      }
    );
    return;
  }

  const users = ctx.message.users_shared.users;
  // ... loop continues
```

The guard goes **between** the `if (!groupIdStr)` block and the `const users = ...` line.

- [ ] **Step 2: Insert the membership guard**

Edit `apps/bot/src/features/user.ts`. Find:

```ts
  const groupIdStr = ctx.session.addMemberGroupId;
  if (!groupIdStr) {
    await ctx.reply(
      "Session expired. Please start the add member process again.",
      {
        reply_markup: { remove_keyboard: true },
      }
    );
    return;
  }

  const users = ctx.message.users_shared.users;
```

Replace with:

```ts
  const groupIdStr = ctx.session.addMemberGroupId;
  if (!groupIdStr) {
    await ctx.reply(
      "Session expired. Please start the add member process again.",
      {
        reply_markup: { remove_keyboard: true },
      }
    );
    return;
  }

  // Membership guard: confirm the requester is actually in the target group
  // before letting them add anyone. Fail-closed on errors (e.g., bot was
  // removed from group, transient API error).
  try {
    const requesterMember = await ctx.api.getChatMember(
      groupIdStr,
      ctx.from!.id
    );
    if (
      requesterMember.status === "left" ||
      requesterMember.status === "kicked"
    ) {
      throw new Error("not-a-member");
    }
  } catch (err) {
    console.warn("Membership guard rejected", {
      groupIdStr,
      userId: ctx.from?.id,
      err,
    });
    ctx.session.addMemberGroupId = undefined;
    await ctx.reply(BotMessages.ADD_MEMBER_NOT_A_MEMBER, {
      reply_markup: { remove_keyboard: true },
    });
    return;
  }

  const users = ctx.message.users_shared.users;
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm --filter bot exec tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Run lint**

Run: `pnpm --filter bot lint`
Expected: clean (no new warnings or errors).

- [ ] **Step 5: Commit**

```bash
git add apps/bot/src/features/user.ts
git commit -m "$(cat <<'EOF'
feat(bot): membership guard before processing users_shared

Verify the requester is actually a member of the target chat (status
not 'left' or 'kicked') before adding anyone. Fail-closed on errors so
a removed bot or transient API error is treated as 'not a member'.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Bot — re-fetch chat title and append inline keyboard to success reply

**Files:**
- Modify: `apps/bot/src/features/user.ts` — top of file (imports), and the `users_shared` handler around lines 232-244 (the existing success reply).

- [ ] **Step 1: Add imports if missing**

At the top of `apps/bot/src/features/user.ts`, the current imports include:

```ts
import { Composer, InlineKeyboard, Keyboard } from "grammy";
```

`InlineKeyboard` is already imported. Now ensure `ChatUtils` and `env` are imported too. Add (if not present):

```ts
import { ChatUtils } from "../utils/chat.js";
import { env } from "../env.js";
```

Place these import lines after the existing imports.

- [ ] **Step 2: Insert chatTitle + miniAppUrl computation BEFORE the loop, right after the membership guard**

Placing this before the loop (rather than after) lets Task 4's per-user DM reuse the same `miniAppUrl` without recomputation.

After Task 2's membership-guard `try/catch` and **before** the line `const users = ctx.message.users_shared.users;`, insert:

```ts
  // Compute chat title + mini-app URL once, used by both per-user DMs
  // (Task 4) and the back-to-app inline button on the success message
  // (this task). We don't persist title in session — see spec § Source
  // of chatTitle for why we re-fetch instead.
  let chatTitle = "the group";
  try {
    const chatInfo = await ctx.api.getChat(groupIdStr);
    if ("title" in chatInfo && chatInfo.title) {
      chatTitle = chatInfo.title;
    }
  } catch {
    // Fall through with default — the back-to-app button still works,
    // it just reads "Open the group in app".
  }

  const miniAppCommand = ChatUtils.createChatContext(
    BigInt(groupIdStr),
    "supergroup"
  );
  const miniAppUrl = ChatUtils.createMiniAppUrl(
    env.MINI_APP_DEEPLINK,
    ctx.me.username,
    miniAppCommand
  );

```

- [ ] **Step 3: Replace the existing post-loop success reply with two messages**

The existing tail of the handler currently looks like this (approx lines 232-244):

```ts
  ctx.session.addMemberGroupId = undefined;

  const resultText = BotMessages.ADD_MEMBER_END_MESSAGE.replace(
    "{success_list}",
    successList.length ? successList.join(", ") : "None"
  ).replace(
    "{failed_list}",
    failedList.length ? failedList.join(", ") : "None"
  );

  await ctx.reply(resultText, {
    reply_markup: { remove_keyboard: true },
  });
});
```

Replace with:

```ts
  ctx.session.addMemberGroupId = undefined;

  const resultText = BotMessages.ADD_MEMBER_END_MESSAGE.replace(
    "{success_list}",
    successList.length ? successList.join(", ") : "None"
  ).replace(
    "{failed_list}",
    failedList.length ? failedList.join(", ") : "None"
  );

  // Telegram does not allow combining `remove_keyboard` with an inline
  // keyboard on the same message. Send two messages: first removes the
  // reply-keyboard, second carries the inline button back to the TMA.
  await ctx.reply(resultText, {
    reply_markup: { remove_keyboard: true },
  });

  if (successList.length > 0) {
    const buttonLabel = BotMessages.ADD_MEMBER_OPEN_APP_BUTTON.replace(
      "{chat_title}",
      chatTitle
    );
    await ctx.reply(`✅ ${successList.length} member(s) added.`, {
      reply_markup: new InlineKeyboard().url(buttonLabel, miniAppUrl),
    });
  }
});
```

The inline-keyboard message is gated on `successList.length > 0` so users who added zero people (e.g., everyone they picked was already a member) don't get a misleading back-to-app prompt — the all-failed reply already explains what happened.

- [ ] **Step 4: Run typecheck**

Run: `pnpm --filter bot exec tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Run lint**

Run: `pnpm --filter bot lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/bot/src/features/user.ts
git commit -m "$(cat <<'EOF'
feat(bot): inline-keyboard back to TMA after add-member success

Re-fetch chat title in the users_shared handler and append a follow-up
message with an "Open <chat> in app" inline button built via the
existing ChatUtils.createMiniAppUrl helper. Send as a separate message
because Telegram disallows combining remove_keyboard with an inline
keyboard on the same reply.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Bot — per-user DM notification with `Forbidden` swallow

**Files:**
- Modify: `apps/bot/src/features/user.ts` — inside the per-user loop in the `users_shared` handler (currently lines ~202-230).

- [ ] **Step 1: Locate the per-user loop and identify the insertion point**

After Task 3, `chatTitle` and `miniAppUrl` are already computed before the loop (right after the membership guard). The DM call goes inside the loop, between `chat.addMember` succeeding and `successList.push`. We want notification only on the path where the user was actually added (not on the CONFLICT-caught path inside `createUser` — that's about the `User` row, not the chat membership).

The relevant slice of the loop body (post Task 3) reads:

```ts
      await ctx.trpc.chat.addMember({
        chatId: Number(groupIdStr),
        userId: Number(user.user_id),
      });

      successList.push(
        user.first_name || user.username || String(user.user_id)
      );
```

- [ ] **Step 2: Add the per-user DM call inside the loop**

Edit the loop body. Current shape (the success branch):

```ts
      await ctx.trpc.chat.addMember({
        chatId: Number(groupIdStr),
        userId: Number(user.user_id),
      });

      successList.push(
        user.first_name || user.username || String(user.user_id)
      );
```

Replace with:

```ts
      await ctx.trpc.chat.addMember({
        chatId: Number(groupIdStr),
        userId: Number(user.user_id),
      });

      // Best-effort DM to the newly-added user. Bots can only initiate a
      // chat with users who have previously DM'd the bot — for first-time
      // users Telegram returns Forbidden, which we swallow.
      try {
        const dmText = BotMessages.ADD_MEMBER_NOTIFY_USER
          .replace(
            "{adder_first_name}",
            escapeMarkdownV2(ctx.from!.first_name)
          )
          .replace("{chat_title}", escapeMarkdownV2(chatTitle));
        const dmButtonLabel = BotMessages.ADD_MEMBER_OPEN_APP_BUTTON.replace(
          "{chat_title}",
          chatTitle
        );
        await ctx.api.sendMessage(Number(user.user_id), dmText, {
          parse_mode: "MarkdownV2",
          reply_markup: new InlineKeyboard().url(dmButtonLabel, miniAppUrl),
        });
      } catch (dmErr) {
        console.warn("Could not DM added user", user.user_id, dmErr);
      }

      successList.push(
        user.first_name || user.username || String(user.user_id)
      );
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm --filter bot exec tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Run lint**

Run: `pnpm --filter bot lint`
Expected: clean.

- [ ] **Step 5: Run existing bot unit tests**

Run: `pnpm --filter bot test`
Expected: all existing tests pass (we only changed handler glue; util tests should be unaffected).

- [ ] **Step 6: Commit**

```bash
git add apps/bot/src/features/user.ts
git commit -m "$(cat <<'EOF'
feat(bot): best-effort DM to each user added via users_shared

After a successful chat.addMember, send the new member a DM with an
Open App inline button. Wrap in try/catch — Forbidden errors are
expected for users who have never DM'd the bot and are silently
swallowed (success list still includes them).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: TMA — rewrite `AddMemberSheet` from placeholder to real CTA

**Files:**
- Modify: `apps/web/src/components/features/Settings/AddMemberSheet.tsx` (full rewrite of the file body)
- Create: `apps/web/src/components/features/Settings/AddMemberSheet.spec.tsx` (Playwright CT)

- [ ] **Step 1: Write the failing component test first (TDD)**

Create `apps/web/src/components/features/Settings/AddMemberSheet.spec.tsx`:

```tsx
import { test, expect } from "@playwright/experimental-ct-react";
import AddMemberSheet from "./AddMemberSheet";

test("renders the new add-member CTA copy", async ({ mount }) => {
  const component = await mount(
    <AddMemberSheet chatId={-1001234567890} open onOpenChange={() => {}} />
  );
  await expect(component.getByText("Open bot DM")).toBeVisible();
  await expect(component.getByText("Cancel")).toBeVisible();
  // No more "coming soon" / placeholder copy
  await expect(component.getByText(/coming soon/i)).toHaveCount(0);
});

test("calls onOpenChange(false) when Cancel is clicked", async ({ mount }) => {
  let lastOpen: boolean | null = null;
  const component = await mount(
    <AddMemberSheet
      chatId={-1001234567890}
      open
      onOpenChange={(v) => {
        lastOpen = v;
      }}
    />
  );
  await component.getByText("Cancel").click();
  expect(lastOpen).toBe(false);
});
```

Note: the third assertion (the actual `openTelegramLink` call) is intentionally not unit-tested here. `openTelegramLink` is a side-effecting Telegram SDK call that is hard to mock through Playwright CT without intrusive setup; we cover it in manual UAT (Task 9).

- [ ] **Step 2: Run the test — expect failure**

Run: `pnpm --filter web exec playwright test src/components/features/Settings/AddMemberSheet.spec.tsx --reporter=list`
Expected: FAIL — the existing component still has placeholder copy and no `chatId` prop.

- [ ] **Step 3: Rewrite `AddMemberSheet.tsx`**

Replace the entire file at `apps/web/src/components/features/Settings/AddMemberSheet.tsx` with:

```tsx
import {
  hapticFeedback,
  openTelegramLink,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import {
  Button,
  IconButton,
  Modal,
  Section,
  Text,
  Title,
} from "@telegram-apps/telegram-ui";
import { X } from "lucide-react";

interface AddMemberSheetProps {
  chatId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AddMemberSheet({
  chatId,
  open,
  onOpenChange,
}: AddMemberSheetProps) {
  const tSubtitleTextColor = useSignal(themeParams.subtitleTextColor);

  const handleOpenBot = () => {
    hapticFeedback.impactOccurred("light");
    const deepLink = `${import.meta.env.VITE_TELEGRAM_BOT_DEEP_LINK}?start=ADD_MEMBER${chatId}`;
    openTelegramLink(deepLink);
    onOpenChange(false);
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      header={
        <Modal.Header
          before={
            <Title weight="2" level="3">
              Add a member
            </Title>
          }
          after={
            <Modal.Close>
              <IconButton
                size="s"
                mode="gray"
                onClick={() => hapticFeedback.impactOccurred("light")}
              >
                <X
                  size={20}
                  strokeWidth={3}
                  style={{ color: tSubtitleTextColor }}
                />
              </IconButton>
            </Modal.Close>
          }
        />
      }
    >
      <div className="pb-6">
        <Section
          className="px-3"
          footer="The bot will send a contact picker. Tap Send when you're done choosing."
        >
          <div className="px-2 py-3">
            <Text style={{ color: tSubtitleTextColor }}>
              We'll open the bot DM where you can pick people from your
              Telegram contacts. They'll be added to this group.
            </Text>
          </div>
        </Section>
        <div className="flex flex-col gap-2 px-3 pt-2">
          <Button stretched size="l" mode="filled" onClick={handleOpenBot}>
            Open bot DM
          </Button>
          <Button
            stretched
            size="l"
            mode="gray"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 4: Re-run the test — expect pass**

Run: `pnpm --filter web exec playwright test src/components/features/Settings/AddMemberSheet.spec.tsx --reporter=list`
Expected: 2/2 tests pass.

- [ ] **Step 5: Run typecheck**

Run: `pnpm --filter web exec tsc --noEmit`
Expected: clean. (Note: this will surface any callers of `AddMemberSheet` that don't yet pass `chatId` — only `MembersSubPage` calls it; we'll fix that in Task 6.)

If typecheck flags `MembersSubPage.tsx` for the missing `chatId` prop, that's expected — Task 6 fixes it. Continue.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/features/Settings/AddMemberSheet.tsx apps/web/src/components/features/Settings/AddMemberSheet.spec.tsx
git commit -m "$(cat <<'EOF'
feat(web): real Add Member sheet with bot deep-link CTA

Replace the "coming soon" placeholder with an explainer + primary
button that calls openTelegramLink with ?start=ADD_MEMBER<chatId>,
plus a secondary Cancel. Same SDK pattern already used at
NewUserPage.tsx:31.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: TMA — `MembersSubPage` updates (chatId prop, drop coming-soon, visibility refetch)

**Files:**
- Modify: `apps/web/src/components/features/Settings/MembersSubPage.tsx`

- [ ] **Step 1: Update the imports + add `trpc.useUtils()` ref**

Open `apps/web/src/components/features/Settings/MembersSubPage.tsx`. Current imports include:

```ts
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  backButton,
  hapticFeedback,
  initData,
  useSignal,
} from "@telegram-apps/sdk-react";
import { ButtonCell, Section, Skeleton } from "@telegram-apps/telegram-ui";
import { Plus } from "lucide-react";
import { trpc } from "@/utils/trpc";
import MemberRow from "./MemberRow";
import AddMemberSheet from "./AddMemberSheet";
```

No new imports needed — `trpc` is already imported. Inside the component body, near the existing `const { data: members, status } = trpc.chat.listMembers.useQuery(...)` line, add a `useUtils` ref:

```ts
  const { data: members, status } = trpc.chat.listMembers.useQuery({ chatId });
  const trpcUtils = trpc.useUtils();
```

- [ ] **Step 2: Add the visibility-change effect**

After the existing `useEffect` for `backButton.onClick`, add a new effect:

```ts
  // When the user returns from the bot DM (or any other tab switch),
  // re-fetch the members list so newly-added members appear without a
  // manual refresh.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        trpcUtils.chat.listMembers.invalidate({ chatId });
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [chatId, trpcUtils]);
```

- [ ] **Step 3: Drop the "coming soon" footer copy and update Section footer**

Find:

```tsx
      <Section
        header={members ? `${members.length} members` : "Members"}
        footer='Tap "Add Member" to share a contact via the bot DM. Coming soon.'
      >
```

Replace the `footer` with:

```tsx
      <Section
        header={members ? `${members.length} members` : "Members"}
        footer='Tap "Add Member" to pick people from your Telegram contacts via the bot.'
      >
```

- [ ] **Step 4: Pass `chatId` to `AddMemberSheet`**

Find the `<AddMemberSheet open={sheetOpen} onOpenChange={setSheetOpen} />` line near the bottom of the component. Replace with:

```tsx
      <AddMemberSheet
        chatId={chatId}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
```

- [ ] **Step 5: Run typecheck**

Run: `pnpm --filter web exec tsc --noEmit`
Expected: clean (the typecheck error from Task 5 step 5 is now resolved).

- [ ] **Step 6: Run web unit tests**

Run: `pnpm --filter web test`
Expected: existing tests still pass.

- [ ] **Step 7: Run web lint**

Run: `pnpm --filter web lint`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/features/Settings/MembersSubPage.tsx
git commit -m "$(cat <<'EOF'
feat(web): wire MembersSubPage to new AddMemberSheet + visibility refetch

Pass chatId down to the sheet, refresh footer copy, and listen for
visibilitychange so the members list re-fetches when the user returns
from the bot DM.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Full repo lint + typecheck pass

**Files:** none modified — verification only.

- [ ] **Step 1: Run repo-wide lint**

Run: `turbo lint`
Expected: cache hits or clean runs across all packages. If any new warnings or errors appear in the touched files, fix and amend the relevant earlier commit (or add a new fixup commit and explain why).

- [ ] **Step 2: Run repo-wide typecheck**

Run: `turbo check-types`
Expected: clean across all packages.

- [ ] **Step 3: If everything is clean, no commit needed**

Move to Task 8.

---

### Task 8: Rename branch and open PR

**Files:** none modified — git/PR operations.

- [ ] **Step 1: Rename branch**

The branch is currently `docs/manual-add-member-spec`. Rename to a `feat/` scope:

```bash
git branch -m docs/manual-add-member-spec feat/manual-add-member
```

- [ ] **Step 2: Push branch with upstream tracking**

```bash
git push -u origin feat/manual-add-member
```

- [ ] **Step 3: Create PR**

```bash
gh pr create --title "feat: manual add-member via bot deep-link" --body "$(cat <<'EOF'
## Summary

- Wires the placeholder "Add Member" button in TMA Settings to the existing bot-side `/start ADD_MEMBER<chatId>` contact-picker flow via `openTelegramLink`.
- Adds three small bot-side improvements to the existing `users_shared` handler: membership guard (reject non-members of the target chat), inline-keyboard "Open <chat> in app" button on the success message, best-effort DM to each added user with the same Open App button.
- Refreshes the members list automatically when the user returns to the TMA via a `visibilitychange` listener.

Spec: [`docs/superpowers/specs/2026-04-26-manual-add-member-design.md`](docs/superpowers/specs/2026-04-26-manual-add-member-design.md)
Plan: [`docs/superpowers/plans/2026-04-26-manual-add-member.md`](docs/superpowers/plans/2026-04-26-manual-add-member.md)

## Test plan

- [ ] Happy path: TMA → Settings → Members → Add Member → Open bot DM → pick 2 contacts → success message appears with "Open <chat>" inline button → tap → land back in TMA → members list shows new entries
- [ ] Notification path: if added user has DM'd bot before, they receive the "you've been added" message with Open App button (visual: emoji, MarkdownV2 escaping, button label render correctly)
- [ ] Notification swallow: add a fresh user (never DM'd bot) — no error surfaces, success list still includes them
- [ ] Membership guard: craft `?start=ADD_MEMBER<chatId-not-yours>` link, tap → bot rejects with the new error string, keyboard removed, session cleared
- [ ] Cancel: "❌ Cancel" keyboard button → session cleared, keyboard removed, fresh re-tap from TMA still works
- [ ] TMA refresh: keep TMA open in background, complete add in bot DM, swipe back — members list updates without manual refresh
- [ ] Subagent DB audit: `_ChatMembers` rows for each added user, `User` rows created for any new ones

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Print PR URL for the user**

The user will use the URL to run UAT. **Do not enable auto-merge yet** — per the project convention, the user does manual UAT first and then explicitly says "ok merge".

---

### Task 9: Manual UAT (post-PR, pre-merge)

**Owner:** user (with subagent assist for DB audits).

This task is **not** a code task. It coordinates UAT once the PR is up and the prod-style preview deployment is ready (the project's GitHub Actions deploy.yml auto-deploys on push to main, but for PR validation the user runs against staging via `@BananaSplitzStgBot`).

- [ ] **Step 1: Subagent DB pre-audit**

Dispatch a `general-purpose` subagent with: chat ID, list of test target user IDs (mix of pre-existing in `User` table + at least one fresh user), and instructions to dump current `_ChatMembers` and `User` row state. Get the snapshot before flow starts.

- [ ] **Step 2: User runs the manual lifecycle**

Walk the user through each item in the PR's test plan via `AskUserQuestion`, one at a time, per the project's manual-UAT convention. Keep option labels terse.

- [ ] **Step 3: Subagent DB post-audit + cleanup**

After the user reports the manual flow worked, dispatch the same subagent style with: chat ID, list of newly-added user IDs from the flow, instructions to (a) verify `_ChatMembers` rows exist + `User` rows created where expected, (b) remove all test members and `User` rows the test created. The DEV-BOX-2 environment must end clean.

- [ ] **Step 4: Enable auto-merge once user says "ok merge"**

```bash
gh pr merge --auto --squash --delete-branch
```

Per project memory: never enable `--auto` before the user explicitly approves merge — it can land in seconds and remove the chance for a clean revert.

---

## Self-review notes

**Spec coverage check** (cross-walked against `docs/superpowers/specs/2026-04-26-manual-add-member-design.md`):

| Spec section | Tasks |
|---|---|
| § Surfaces 1 — TMA `AddMemberSheet` rewrite | Task 5 |
| § Surfaces 2 — `MembersSubPage` chatId prop, footer copy, visibility refetch | Task 6 |
| § Surfaces 3 — Bot membership guard | Task 2 |
| § Surfaces 4 — Bot improved success message + chatTitle re-fetch (option 1) | Tasks 1, 3 (refactored in Task 4) |
| § Surfaces 5 — Bot per-user DM with Forbidden swallow | Task 4 |
| § Surfaces 6 — Bot message strings (`ADD_MEMBER_NOT_A_MEMBER`, `ADD_MEMBER_NOTIFY_USER`) | Task 1 (also adds `ADD_MEMBER_OPEN_APP_BUTTON` for inline-button label, used in Tasks 3 + 4) |
| § Test plan | Tasks 5 (component test), 7 (lint/typecheck), 9 (manual UAT + DB audit) |
| § Edge cases | All covered by handler guards (Task 2), CONFLICT swallow already in code, `Forbidden` swallow (Task 4), visibility refetch (Task 6) |

**Type/name consistency:**

- `chatTitle`, `miniAppCommand`, `miniAppUrl` are introduced in Task 3 and consumed in Task 4 with the same names — verified consistent.
- `BotMessages.ADD_MEMBER_OPEN_APP_BUTTON` introduced in Task 1 and consumed in Tasks 3 + 4 — same identifier.
- `AddMemberSheet`'s new `chatId` prop introduced in Task 5 and consumed in Task 6 — same name + same type (`number`).
- `trpcUtils` (Task 6) matches the convention used in sibling files (`AccountSubPage.tsx:36`, `EditReminderScheduleModal.tsx:58`).

**Placeholder scan:** none.
