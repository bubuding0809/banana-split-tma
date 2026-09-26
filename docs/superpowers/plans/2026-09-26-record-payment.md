# Record Payment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a member record a payment of any amount, in either direction, between themselves and one other member, from the group page or from the pay/receive popups. The group gets a neutral notification with a "View payment" deep link.

**Architecture:** No schema change. The backend `settlement.createSettlement` already accepts any amount. It gains a `notificationKind` flag and passes the settlement id and the caller id to the notification handler, which adds a new neutral message and a View payment button (new deep-link entity `st`). The web app gets a new two-step route `/chat/$chatId/record-payment` that mirrors Add expense (Amount step, then Who step), a split button on GroupPage, and an "Other options" section in ToPay/ToReceive.

**Tech Stack:** TypeScript, tRPC + zod, Prisma, grammy `Api` (Bot API), React 19 + TanStack Router/Form, `@telegram-apps/sdk-react` + `@telegram-apps/telegram-ui`, vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-09-26-record-payment-design.md`

## Global Constraints

- No Prisma schema change or migration.
- `notificationKind` defaults to `"settle_up"`. Every existing caller must behave exactly as before, apart from gaining the View payment button.
- One side of a recorded payment is always the current user. The member list excludes the current user.
- New deep-link entity code is `st`. `s` stays snapshot. Existing `s`, `e`, `p`, `c`, `rt` links must keep decoding and routing unchanged.
- UI uses `@telegram-apps/telegram-ui` components (Section, Cell, SegmentedControl, Radio, etc.). No raw `<select>`, `window.confirm` or `alert`; errors go through `popup.open.ifAvailable`.
- New message copy, exactly: `💸 {payer} paid {receiver} {amount}{ (description)}`. The tagged side is a MarkdownV2 mention; the other is an escaped plain name.
- The existing "✅ Great news …" text is unchanged. The button label is exactly `View payment`.
- Step labels are `Amount` and `Who`. Step 2 headers are `Paid to?` / `Received from?`. Toggle labels are `I paid` / `I received`.
- Popup section header is `Other options`. Cell copy is `Pay a different amount` (ToPay) / `Received a different amount` (ToReceive).
- Group page secondary button label: `💸 Payment`. Route title search param: `💸 Record payment`.
- No summary line on step 2.
- CLI (`apps/cli/**`) is NOT touched.
- Never commit to `main`. Work on `feat/record-payment` (already created) in the main workspace, not a worktree.

## Review Focus

1. **API-key / agent callers with no user session.** `createSettlement` with `notificationKind: "payment"` and no `ctx.session.user` must still send the message, tagging the receiver. The test is added in Task 3.
2. **Receiver records the payment.** The message must tag the *payer*, not the receiver, and read `@Payer paid Receiver`. The test is added in Task 2 and Task 3.
3. **Deep-link cold open to a settlement not yet loaded, or deleted.** The scroll poll must give up quietly and the details popup must not open for a missing id. Covered by the shared poll in Task 4; the auto-open only fires in the cell whose id matches.
4. **Prefill from the popup while an old draft exists.** Prefill search params must win over the stored draft. The test is added in Task 5 (`resolveInitialValues`).
5. **Amount strings like `"12."`, `"0"`, `""` or `"0.001"`.** Step 1 must block Next; only amounts ≥ 0.01 pass. The test is added in Task 5 (`isValidAmount`).

---

## File map

**Backend (`packages/trpc/src`)**
- Modify `utils/deepLinkProtocol.ts`: add `"st"` to the entity union.
- Modify `utils/deepLinkProtocol.spec.ts`: add an `st` round-trip test.
- Modify `routers/telegram/sendSettlementNotificationMessage.ts`: `kind`, `debtorUserId`, `mentionTarget`, `settlementId` → new copy + button.
- Modify `routers/telegram/sendSettlementNotificationMessage.spec.ts`.
- Modify `routers/settlement/createSettlement.ts`: `notificationKind`, `callerUserId`, pass `settlementId`.
- Create `routers/settlement/createSettlement.spec.ts`.
- Modify `routers/settlement/settleAllDebts.ts`: pass `settlementId` so bulk settle messages also get the button.

**Web (`apps/web/src`)**
- Modify `hooks/useStartParams.ts` + `hooks/useStartParams.spec.ts`: accept `st`.
- Modify `routes/_tma/chat.$chatId.tsx` + `chat.$chatId.test.tsx`: `selectedSettlement` search param + `st` redirect.
- Modify `components/features/Chat/ChatTransactionTab.tsx`: scroll to `selectedSettlement` too.
- Modify `components/features/Chat/ChatSettlementCell.tsx`: auto-open + clear param.
- Create `components/features/Payment/recordPayment.ts`: pure logic (parties, names, balances, validation, initial values).
- Create `components/features/Payment/recordPayment.test.ts`.
- Create `components/features/Payment/RecordPaymentForm.ts`: form options.
- Create `components/features/Payment/PaymentAmountStep.tsx`: step 1 UI.
- Create `components/features/Payment/PaymentWhoStep.tsx`: step 2 UI.
- Create `components/features/Payment/RecordPaymentPage.tsx`: page, buttons, submit.
- Create `routes/_tma/chat.$chatId_.record-payment.tsx`: route + search schema.
- Create `components/features/Payment/GroupActionButtons.tsx` + `GroupActionButtons.test.tsx`: `[+ Add expense] [💸 Payment]`.
- Modify `components/features/Chat/GroupPage.tsx`: use `GroupActionButtons`.
- Create `components/features/Chat/OtherOptionsSection.tsx`: Section + bottom padding.
- Create `components/features/Chat/DifferentAmountCell.tsx` + `DifferentAmountCell.test.tsx`.
- Modify `components/features/Chat/MoveDebtEntry.tsx`: `bare` prop (no Section wrapper).
- Modify `components/features/Chat/ToPayModal.tsx`, `ToReceiveModal.tsx`: use the Other options section.

`routeTree.gen.ts` regenerates automatically when the dev server or build runs (TanStack Router plugin). Commit the regenerated file with Task 6.

---

### Task 1: Deep-link entity `st` (protocol + start params)

The existing `s`, `e`, `p`, `c`, `rt` round-trips are already locked in `deepLinkProtocol.spec.ts`, and `rt` + v1 parsing in `useStartParams.spec.ts`. Run them first to confirm they are green, then add `st` test-first.

**Files:**
- Modify: `packages/trpc/src/utils/deepLinkProtocol.ts:13`
- Test: `packages/trpc/src/utils/deepLinkProtocol.spec.ts`
- Modify: `apps/web/src/hooks/useStartParams.ts:8,15`
- Test: `apps/web/src/hooks/useStartParams.spec.ts`

**Interfaces:**
- Produces: `encodeV1DeepLink(chatId: bigint, chatType: string, entityType?: "s" | "e" | "p" | "c" | "rt" | "st", entityId?: string): string`; `StartParams.entity_type` includes `"st"`.

- [ ] **Step 1: Confirm the existing link tests are green (lock)**

Run: `pnpm --filter @dko/trpc exec vitest run src/utils/deepLinkProtocol.spec.ts && pnpm --filter web exec vitest run src/hooks/useStartParams.spec.ts`
Expected: all PASS.

- [ ] **Step 2: Write the failing protocol test**

Append inside the `describe` in `packages/trpc/src/utils/deepLinkProtocol.spec.ts`:

```ts
  it("encodes and decodes 'st' (settlement) entity round-trip", () => {
    const chatId = -1001234567890n;
    const entityId = "123e4567-e89b-12d3-a456-426614174000";

    const encoded = encodeV1DeepLink(chatId, "g", "st", entityId);

    expect(encoded).toMatch(/^v1_g_/);
    expect(encoded).toContain("_st_");
    expect(encoded.length).toBeLessThan(64);

    expect(decodeV1DeepLink(encoded)).toEqual({
      chat_id: "-1001234567890",
      chat_type: "g",
      entity_type: "st",
      entity_id: entityId,
    });
  });
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter @dko/trpc exec vitest run src/utils/deepLinkProtocol.spec.ts`
Expected: a TypeScript/vitest type error on `"st"` not assignable. If vitest does not type-check, run `pnpm --filter @dko/trpc exec tsc --noEmit` and expect `Argument of type '"st"' is not assignable`.

- [ ] **Step 4: Widen the union**

In `packages/trpc/src/utils/deepLinkProtocol.ts`:

```ts
  entityType?: "s" | "e" | "p" | "c" | "rt" | "st",
```

- [ ] **Step 5: Write the failing start-params test**

Append inside the `describe` in `apps/web/src/hooks/useStartParams.spec.ts`:

```ts
  it("parses 'st' (settlement) entity from v1 payload", () => {
    const result = parseRawParams("v1_g_1E2R4w_st_7N42dgm5tFLK9N8MT7fXbc");
    expect(result).toEqual({
      chat_id: -1001234567890,
      chat_type: "g",
      entity_type: "st",
      entity_id: "123e4567-e89b-12d3-a456-426614174000",
    });
  });
```

Run: `pnpm --filter web exec vitest run src/hooks/useStartParams.spec.ts`
Expected: FAIL. `parseRawParams` throws "Failed to parse raw start parameters" because the zod enum rejects `st`.

- [ ] **Step 6: Accept `st` in the web parser**

In `apps/web/src/hooks/useStartParams.ts`:

```ts
  entity_type: z.enum(["s", "e", "p", "c", "rt", "st"]).optional(),
```

and

```ts
  entity_type?: "s" | "e" | "p" | "c" | "rt" | "st";
```

- [ ] **Step 7: Run both suites**

Run: `pnpm --filter @dko/trpc exec vitest run src/utils/deepLinkProtocol.spec.ts && pnpm --filter web exec vitest run src/hooks/useStartParams.spec.ts`
Expected: all PASS (old and new).

- [ ] **Step 8: Commit**

```bash
git add packages/trpc/src/utils/deepLinkProtocol.ts packages/trpc/src/utils/deepLinkProtocol.spec.ts apps/web/src/hooks/useStartParams.ts apps/web/src/hooks/useStartParams.spec.ts
git commit -m "feat(deeplink): add 'st' settlement entity"
```

---

### Task 2: Settlement notification: neutral payment copy + View payment button

**Files:**
- Modify: `packages/trpc/src/routers/telegram/sendSettlementNotificationMessage.ts`
- Test: `packages/trpc/src/routers/telegram/sendSettlementNotificationMessage.spec.ts`

**Interfaces:**
- Consumes: `encodeV1DeepLink(..., "st", id)` from Task 1; `createDeepLinkedUrl`, `inlineKeyboard`, `mentionMarkdown`, `escapeMarkdown` from `../../utils/telegram.js`.
- Produces: `sendSettlementNotificationMessageHandler(input, db, teleBot, log)`, where `input` gains:
  - `kind?: "settle_up" | "payment"` (default `"settle_up"`)
  - `debtorUserId?: number`
  - `mentionTarget?: "creditor" | "debtor"` (default `"creditor"`)
  - `settlementId?: string` (a uuid; when present, the message gets a `View payment` button)
  Returns `Promise<number | null>` (message id) as today.

- [ ] **Step 1: Write the failing tests**

In `sendSettlementNotificationMessage.spec.ts`, add `getMe: vi.fn()` to `mockTeleBot`, and add this block below the existing `describe`:

```ts
import { decodeV1DeepLink } from "../../utils/deepLinkProtocol.js";

describe("sendSettlementNotificationMessage copy + button", () => {
  const SETTLEMENT_ID = "123e4567-e89b-12d3-a456-426614174000";

  beforeEach(() => {
    vi.resetAllMocks();
    mockTeleBot.sendMessage.mockResolvedValue({ message_id: 77 });
    mockTeleBot.getMe.mockResolvedValue({ username: "testbot" });
  });

  const sentText = () => mockTeleBot.sendMessage.mock.calls[0]![1] as string;
  const sentOpts = () => mockTeleBot.sendMessage.mock.calls[0]![2] as any;

  it("settle_up keeps the Great news text", async () => {
    await sendSettlementNotificationMessageHandler(
      { ...baseInput, chatId: -100, force: true },
      mockDb,
      mockTeleBot as any
    );
    expect(sentText()).toContain("✅ Great news");
    expect(sentText()).toContain("Bob has settled their debt of");
  });

  it("payment tags the creditor by default: '💸 Bob paid @Alice'", async () => {
    await sendSettlementNotificationMessageHandler(
      {
        ...baseInput,
        chatId: -100,
        force: true,
        kind: "payment",
        debtorUserId: 2,
        description: "Concert tickets",
      },
      mockDb,
      mockTeleBot as any
    );
    const text = sentText();
    expect(text.startsWith("💸 Bob paid [Alice](tg://user?id=1)")).toBe(true);
    expect(text).toContain("SGD 10\\.00");
    expect(text).toContain("\\(Concert tickets\\)");
    expect(text).not.toContain("Great news");
  });

  it("payment with mentionTarget=debtor tags the payer: '💸 @Bob paid Alice'", async () => {
    await sendSettlementNotificationMessageHandler(
      {
        ...baseInput,
        chatId: -100,
        force: true,
        kind: "payment",
        debtorUserId: 2,
        mentionTarget: "debtor",
      },
      mockDb,
      mockTeleBot as any
    );
    expect(sentText().startsWith("💸 [Bob](tg://user?id=2) paid Alice ")).toBe(
      true
    );
  });

  it("adds a View payment button that deep links to the settlement", async () => {
    await sendSettlementNotificationMessageHandler(
      { ...baseInput, chatId: -100, force: true, settlementId: SETTLEMENT_ID },
      mockDb,
      mockTeleBot as any
    );
    const button = sentOpts().reply_markup.inline_keyboard[0][0];
    expect(button.text).toBe("View payment");
    const payload = new URL(button.url).searchParams.get("startapp")!;
    expect(decodeV1DeepLink(payload)).toMatchObject({
      chat_type: "g",
      entity_type: "st",
      entity_id: SETTLEMENT_ID,
    });
  });

  it("uses chat type 'p' for a positive (private) chat id", async () => {
    await sendSettlementNotificationMessageHandler(
      { ...baseInput, chatId: 555, force: true, settlementId: SETTLEMENT_ID },
      mockDb,
      mockTeleBot as any
    );
    const url = sentOpts().reply_markup.inline_keyboard[0][0].url as string;
    const payload = new URL(url).searchParams.get("startapp")!;
    expect(decodeV1DeepLink(payload)?.chat_type).toBe("p");
  });

  it("sends no keyboard when settlementId is absent", async () => {
    await sendSettlementNotificationMessageHandler(
      { ...baseInput, chatId: -100, force: true },
      mockDb,
      mockTeleBot as any
    );
    expect(sentOpts().reply_markup).toBeUndefined();
    expect(mockTeleBot.getMe).not.toHaveBeenCalled();
  });
});
```

Note: check the exact output of `mentionMarkdown(id, name, 2)` in `utils/telegram.ts`. If it emits a different form than `[Alice](tg://user?id=1)`, update the two `startsWith` expectations to that exact form before running.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @dko/trpc exec vitest run src/routers/telegram/sendSettlementNotificationMessage.spec.ts`
Expected: the new payment and button tests FAIL (the payment tests on text, the button tests on `reply_markup` undefined). The existing gating tests still PASS.

- [ ] **Step 3: Implement**

In `sendSettlementNotificationMessage.ts`, extend the schema:

```ts
  force: z.boolean().default(false),
  kind: z.enum(["settle_up", "payment"]).default("settle_up"),
  debtorUserId: z.number().optional(),
  mentionTarget: z.enum(["creditor", "debtor"]).default("creditor"),
  settlementId: z.string().uuid().optional(),
```

Change the handler input type so the defaulted fields are optional for callers:

```ts
export const sendSettlementNotificationMessageHandler = async (
  input: z.input<typeof inputSchema>,
  db: Db,
  teleBot: Api,
  log: Logger = trpcLogger
) => {
  const kind = input.kind ?? "settle_up";
  const mentionTarget = input.mentionTarget ?? "creditor";
  const currency = input.currency ?? "SGD";
```

Use `currency` in place of `input.currency` for `formattedAmount`. Replace the mention and message block (from `// Escape names for MarkdownV2` down to `const message = ...`) with:

```ts
  const safeMention = (userId: number | undefined, name: string) => {
    if (userId === undefined) return escapeMarkdown(name, 2);
    try {
      return mentionMarkdown(userId, name, 2);
    } catch {
      return escapeMarkdown(name, 2);
    }
  };

  const descriptionPart = input.description
    ? ` \\(${escapeMarkdown(input.description, 2)}\\)`
    : "";

  let message: string;
  if (kind === "payment") {
    const tagDebtor = mentionTarget === "debtor";
    const payer = tagDebtor
      ? safeMention(input.debtorUserId, input.debtorName)
      : escapeMarkdown(input.debtorName, 2);
    const receiver = tagDebtor
      ? escapeMarkdown(input.creditorName, 2)
      : safeMention(input.creditorUserId, input.creditorName);
    message = `💸 ${payer} paid ${receiver} ${formattedAmount}${descriptionPart}`;
  } else {
    const creditorMention = safeMention(
      input.creditorUserId,
      input.creditorName
    );
    const escapedDebtorName = escapeMarkdown(input.debtorName, 2);
    message = `✅ Great news ${creditorMention}\\!\n${escapedDebtorName} has settled their debt of ${formattedAmount}${descriptionPart}\\!`;
  }

  let keyboard = {};
  if (input.settlementId) {
    const botInfo = await teleBot.getMe();
    const chatTypeCode = input.chatId < 0 ? "g" : "p";
    const payload = encodeV1DeepLink(
      BigInt(input.chatId),
      chatTypeCode,
      "st",
      input.settlementId
    );
    keyboard = inlineKeyboard([
      {
        text: "View payment",
        url: createDeepLinkedUrl(botInfo.username, payload, "app"),
      },
    ]);
  }
```

Add `...keyboard` to the `sendMessage` options:

```ts
    const sentMessage = await teleBot.sendMessage(input.chatId, message, {
      parse_mode: "MarkdownV2",
      message_thread_id: input.threadId,
      ...keyboard,
    });
```

Update imports:

```ts
import {
  mentionMarkdown,
  escapeMarkdown,
  createDeepLinkedUrl,
  inlineKeyboard,
} from "../../utils/telegram.js";
import { encodeV1DeepLink } from "../../utils/deepLinkProtocol.js";
```

In the tRPC procedure at the bottom, keep `.input(inputSchema.omit({ force: true }))`. The new fields are optional, so the procedure contract stays compatible.

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @dko/trpc exec vitest run src/routers/telegram/sendSettlementNotificationMessage.spec.ts`
Expected: all PASS.

- [ ] **Step 5: Type-check the package**

Run: `pnpm --filter @dko/trpc exec tsc --noEmit`
Expected: no errors. `settleAllDebts.ts` and `createSettlement.ts` still compile, since the new fields are optional.

- [ ] **Step 6: Commit**

```bash
git add packages/trpc/src/routers/telegram/sendSettlementNotificationMessage.ts packages/trpc/src/routers/telegram/sendSettlementNotificationMessage.spec.ts
git commit -m "feat(settlement): neutral payment notification + View payment button"
```

---

### Task 3: `createSettlement` notificationKind + caller-aware tagging; bulk settle passes the id

**Files:**
- Modify: `packages/trpc/src/routers/settlement/createSettlement.ts`
- Create: `packages/trpc/src/routers/settlement/createSettlement.spec.ts`
- Modify: `packages/trpc/src/routers/settlement/settleAllDebts.ts:~127`

**Interfaces:**
- Consumes: the Task 2 handler fields `kind`, `debtorUserId`, `mentionTarget`, `settlementId`.
- Produces: `createSettlement` input gains `notificationKind?: "settle_up" | "payment"` (default `"settle_up"`) and `date?: Date` (the settlement's transaction date; the column default is used when omitted). The handler signature becomes `createSettlementHandler(input, db, teleBot, log?, callerUserId?: number)`.

- [ ] **Step 1: Write the failing tests**

Create `packages/trpc/src/routers/settlement/createSettlement.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSettlementHandler, inputSchema } from "./createSettlement.js";

const notify = vi.fn();
vi.mock("../telegram/sendSettlementNotificationMessage.js", () => ({
  sendSettlementNotificationMessageHandler: (...args: unknown[]) =>
    notify(...args),
}));
vi.mock("../../utils/chatValidation.js", () => ({
  assertUsersInChat: vi.fn(async () => undefined),
}));

const SETTLEMENT_ID = "123e4567-e89b-12d3-a456-426614174000";
const mockDb = {
  chat: { findUnique: vi.fn() },
  settlement: {
    create: vi.fn(),
    update: vi.fn(),
  },
} as any;

const parse = (over: Record<string, unknown> = {}) =>
  inputSchema.parse({
    chatId: -100,
    senderId: 1, // payer / debtor
    receiverId: 2, // receiver / creditor
    amount: 20,
    currency: "SGD",
    sendNotification: true,
    creditorName: "Bob",
    debtorName: "Alice",
    ...over,
  });

describe("createSettlementHandler notifications", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockDb.settlement.create.mockResolvedValue({
      id: SETTLEMENT_ID,
      chatId: -100n,
      senderId: 1n,
      receiverId: 2n,
      amount: 20,
      currency: "SGD",
      description: null,
      date: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    notify.mockResolvedValue(555);
  });

  it("defaults to settle_up and passes the settlement id", async () => {
    await createSettlementHandler(parse(), mockDb, {} as any);
    expect(notify).toHaveBeenCalledOnce();
    expect(notify.mock.calls[0]![0]).toMatchObject({
      kind: "settle_up",
      settlementId: SETTLEMENT_ID,
      creditorUserId: 2,
      debtorUserId: 1,
      mentionTarget: "creditor",
    });
    expect(mockDb.settlement.update).toHaveBeenCalledWith({
      where: { id: SETTLEMENT_ID },
      data: { telegramMessageId: 555n },
    });
  });

  it("payment recorded by the payer tags the receiver (creditor)", async () => {
    await createSettlementHandler(
      parse({ notificationKind: "payment" }),
      mockDb,
      {} as any,
      undefined,
      1
    );
    expect(notify.mock.calls[0]![0]).toMatchObject({
      kind: "payment",
      mentionTarget: "creditor",
    });
  });

  it("payment recorded by the receiver tags the payer (debtor)", async () => {
    await createSettlementHandler(
      parse({ notificationKind: "payment" }),
      mockDb,
      {} as any,
      undefined,
      2
    );
    expect(notify.mock.calls[0]![0]).toMatchObject({
      kind: "payment",
      mentionTarget: "debtor",
    });
  });

  it("payment with no caller (API key) tags the receiver", async () => {
    await createSettlementHandler(
      parse({ notificationKind: "payment" }),
      mockDb,
      {} as any
    );
    expect(notify.mock.calls[0]![0]).toMatchObject({
      kind: "payment",
      mentionTarget: "creditor",
    });
  });

  it("does not notify when sendNotification is false", async () => {
    await createSettlementHandler(
      parse({ sendNotification: false }),
      mockDb,
      {} as any
    );
    expect(notify).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @dko/trpc exec vitest run src/routers/settlement/createSettlement.spec.ts`
Expected: FAIL. `notificationKind` is stripped, and `kind`, `settlementId`, `debtorUserId` and `mentionTarget` are missing from the notify call.

- [ ] **Step 3: Implement**

In `createSettlement.ts`, add to `inputSchema` (after `threadId`):

```ts
  notificationKind: z.enum(["settle_up", "payment"]).default("settle_up"),
  date: z.coerce.date().optional(),
```

In the `db.settlement.create({ data: { ... } })` call, add `...(input.date ? { date: input.date } : {}),`. Omitting `date` keeps the column default `now()` for existing callers. Add this test to `createSettlement.spec.ts`:

```ts
  it("stores the provided transaction date", async () => {
    const date = new Date("2026-09-20T00:00:00Z");
    await createSettlementHandler(parse({ date }), mockDb, {} as any);
    expect(mockDb.settlement.create.mock.calls[0]![0].data.date).toEqual(date);
  });
```

Change the handler signature:

```ts
export const createSettlementHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db,
  teleBot: Api,
  log: Logger = trpcLogger,
  callerUserId?: number
) => {
```

Replace the object passed to `sendSettlementNotificationMessageHandler` with:

```ts
          {
            chatId: Number(input.chatId),
            creditorUserId: Number(input.receiverId), // creditor receives the money
            creditorName: input.creditorName,
            creditorUsername: input.creditorUsername,
            debtorName: input.debtorName,
            debtorUserId: Number(input.senderId),
            amount: input.amount,
            currency: currency,
            description: input.description,
            threadId: input.threadId,
            force: false,
            kind: input.notificationKind,
            // Tag whoever did NOT record it. Receiver recorded → tag payer.
            // Payer recorded, or no caller (API key) → tag receiver.
            mentionTarget:
              callerUserId !== undefined &&
              BigInt(callerUserId) === input.receiverId
                ? "debtor"
                : "creditor",
            settlementId: settlement.id,
          },
```

Keep the existing `description` field if it is already passed; do not pass it twice. Check the lines between `amount:` and `currency:` in the current call and merge.

In the procedure at the bottom:

```ts
  .mutation(async ({ input, ctx }) => {
    await assertChatAccess(ctx.session, ctx.db, input.chatId);
    const callerId =
      "user" in ctx.session && ctx.session.user?.id !== undefined
        ? Number(ctx.session.user.id)
        : undefined;
    return createSettlementHandler(
      input,
      ctx.db,
      ctx.teleBot,
      ctx.log,
      callerId
    );
  });
```

If `ctx.session`'s type union makes `"user" in ctx.session` fail to narrow, mirror the access pattern in `middleware/chatScope.ts:44-54` (`(session.user as any).id`).

In `settleAllDebts.ts`, in the `validBalances.map((balance) => ...)` call, change the callback to `(balance, i) =>` and add to the handler input:

```ts
                settlementId: settlements[i]?.id,
```

- [ ] **Step 4: Run tests + type-check**

Run: `pnpm --filter @dko/trpc exec vitest run src/routers/settlement src/routers/telegram && pnpm --filter @dko/trpc exec tsc --noEmit`
Expected: all PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add packages/trpc/src/routers/settlement/createSettlement.ts packages/trpc/src/routers/settlement/createSettlement.spec.ts packages/trpc/src/routers/settlement/settleAllDebts.ts
git commit -m "feat(settlement): notificationKind + tag the non-recorder"
```

---

### Task 4: Web deep-link landing for `st`

**Files:**
- Modify: `apps/web/src/routes/_tma/chat.$chatId.tsx` (search schema + effect)
- Test: `apps/web/src/routes/_tma/chat.$chatId.test.tsx`
- Modify: `apps/web/src/components/features/Chat/ChatTransactionTab.tsx:~54-150`
- Modify: `apps/web/src/components/features/Chat/ChatSettlementCell.tsx`

**Interfaces:**
- Consumes: `StartParams.entity_type === "st"` (Task 1).
- Produces: search param `selectedSettlement?: string` on `/chat/$chatId`.

- [ ] **Step 1: Write the failing route tests**

Append inside the `describe` in `chat.$chatId.test.tsx`:

```tsx
  it("should navigate to the transaction tab with selectedSettlement when entity_type is 'st' and flag is false", () => {
    mockGetItem.mockReturnValue(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (useStartParams as any).mockReturnValue({
      chat_id: "1234",
      entity_type: "st",
      entity_id: "settle-uuid-1",
    });

    render(<ChatIdRoute />);

    expect(mockSetItem).toHaveBeenCalledWith(
      "deep_link_consumed_settle-uuid-1",
      "true"
    );
    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/chat/$chatId",
      params: { chatId: "1234" },
      search: {
        selectedTab: "transaction",
        selectedSettlement: "settle-uuid-1",
      },
      replace: true,
    });
  });

  it("should not navigate for entity_type 'st' when already consumed", () => {
    mockGetItem.mockReturnValue("true");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (useStartParams as any).mockReturnValue({
      chat_id: "1234",
      entity_type: "st",
      entity_id: "settle-uuid-1",
    });

    render(<ChatIdRoute />);

    expect(mockNavigate).not.toHaveBeenCalled();
  });
```

Run: `pnpm --filter web exec vitest run "src/routes/_tma/chat.\$chatId.test.tsx"`
Expected: the first new test FAILS (navigate not called). All existing `s`/`e`/`rt` tests PASS.

- [ ] **Step 2: Implement the route**

In `chat.$chatId.tsx`, add to `searchSchema`:

```ts
  selectedSettlement: z.string().optional(),
```

Inside the deep-link `useEffect`, after the `rt` block:

```ts
    // Settlement deep link — "View payment" CTA on settlement
    // notifications. Mirrors the expense path: transaction tab, scroll,
    // ChatSettlementCell auto-opens its details modal.
    if (
      startParams?.entity_type === "st" &&
      startParams?.entity_id &&
      !sessionStorage.getItem(deepLinkConsumedKey)
    ) {
      sessionStorage.setItem(deepLinkConsumedKey, "true");

      navigate({
        to: "/chat/$chatId",
        params: { chatId: chatId.toString() },
        search: {
          selectedTab: "transaction",
          selectedSettlement: startParams.entity_id,
        },
        replace: true,
      });
    }
```

Run the route test again. Expected: all PASS.

- [ ] **Step 3: Scroll to the settlement in ChatTransactionTab**

In `ChatTransactionTab.tsx`, add `selectedSettlement` to the `useSearch` destructure and its type:

```ts
    selectedExpense,
    selectedSettlement,
```

```ts
    selectedExpense?: string;
    selectedSettlement?: string;
```

In the auto-scroll effect, scroll to whichever id is set:

```ts
  useEffect(() => {
    const targetId = selectedExpense ?? selectedSettlement;
    if (!targetId || firstLoadDoneRef.current) return;
```

Replace `scrollToTransaction(selectedExpense)` with `scrollToTransaction(targetId)`, and the dependency array with `[selectedExpense, selectedSettlement]`.

Check that `findTransactionIndex` in `VirtualizedCombinedTransactionSegment.tsx` matches settlement rows by their `id`. If it only matches expenses, extend it to compare the settlement's `id` too, and note this in the commit message.

- [ ] **Step 4: Auto-open the settlement modal**

In `ChatSettlementCell.tsx`:

```tsx
import { useNavigate, useSearch } from "@tanstack/react-router";
```

Inside the component, replace `const [isModalOpen, setIsModalOpen] = useState(false);` with:

```tsx
  const { selectedSettlement } = useSearch({ strict: false }) as {
    selectedSettlement?: string;
  };
  const navigate = useNavigate();
  const [isModalOpen, setIsModalOpen] = useState(
    () => settlement.id === selectedSettlement
  );
```

In `onOpenChange`, in the `else` (closing) branch, clear the param so reopening the tab doesn't reopen the modal:

```tsx
      if (selectedSettlement === settlement.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        navigate({ search: ((prev: any) => ({ ...prev, selectedSettlement: undefined })) as any });
      }
```

- [ ] **Step 5: Type-check and run the web tests**

Run: `pnpm --filter web exec tsc --noEmit && pnpm --filter web exec vitest run`
Expected: no type errors, all PASS.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/routes/_tma/chat.\$chatId.tsx" "apps/web/src/routes/_tma/chat.\$chatId.test.tsx" apps/web/src/components/features/Chat/ChatTransactionTab.tsx apps/web/src/components/features/Chat/ChatSettlementCell.tsx
git commit -m "feat(web): open settlement from 'st' deep link"
```

---

### Task 5: Record-payment pure logic

**Files:**
- Create: `apps/web/src/components/features/Payment/recordPayment.ts`
- Test: `apps/web/src/components/features/Payment/recordPayment.test.ts`

**Interfaces:**
- Produces (all exported from `recordPayment.ts`):
  - `type PaymentDirection = "paid" | "received"`
  - `type RecordPaymentValues = { amount: string; currency: string; description: string; date: string; direction: PaymentDirection; counterpartyId: string }`
  - `type RecordPaymentPrefill = { direction?: PaymentDirection; counterpartyId?: number; amount?: number; currency?: string }`
  - `isValidAmount(amount: string): boolean`
  - `toParties(direction, userId: number, counterpartyId: number): { senderId: number; receiverId: number }`
  - `toNotificationNames(direction, me: { firstName: string }, counterparty: { firstName: string; username?: string | null }): { creditorName: string; creditorUsername?: string; debtorName: string }`
  - `type BalanceWith = { kind: "you_owe" | "owes_you" | "settled"; amount: number }`
  - `balanceWith(memberId: number, currency: string, debtors: BalanceRow[] | undefined, creditors: BalanceRow[] | undefined): BalanceWith`, where `BalanceRow = { id: number; balances: { currency: string; amount: number }[] }`
  - `resolveInitialValues(opts: { prefill: RecordPaymentPrefill; draft: RecordPaymentValues | null; baseCurrency: string; today: string }): RecordPaymentValues`

- [ ] **Step 1: Write the failing tests**

Create `recordPayment.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  isValidAmount,
  toParties,
  toNotificationNames,
  balanceWith,
  resolveInitialValues,
  type RecordPaymentValues,
} from "./recordPayment";

describe("isValidAmount", () => {
  it.each([
    ["", false],
    ["0", false],
    ["0.00", false],
    ["0.001", false],
    ["12.", false],
    ["abc", false],
    ["0.01", true],
    ["20", true],
    ["587.88", true],
  ])("%s → %s", (input, expected) => {
    expect(isValidAmount(input)).toBe(expected);
  });
});

describe("toParties", () => {
  it("I paid → me sender, them receiver", () => {
    expect(toParties("paid", 1, 2)).toEqual({ senderId: 1, receiverId: 2 });
  });
  it("I received → them sender, me receiver", () => {
    expect(toParties("received", 1, 2)).toEqual({ senderId: 2, receiverId: 1 });
  });
});

describe("toNotificationNames", () => {
  const me = { firstName: "RQ" };
  const bob = { firstName: "Bob", username: "bob99" };
  it("I paid Bob → Bob is creditor, I am debtor", () => {
    expect(toNotificationNames("paid", me, bob)).toEqual({
      creditorName: "Bob",
      creditorUsername: "bob99",
      debtorName: "RQ",
    });
  });
  it("I received from Bob → I am creditor, Bob is debtor", () => {
    expect(toNotificationNames("received", me, bob)).toEqual({
      creditorName: "RQ",
      creditorUsername: undefined,
      debtorName: "Bob",
    });
  });
});

describe("balanceWith", () => {
  const debtors = [{ id: 3, balances: [{ currency: "SGD", amount: 12 }] }];
  const creditors = [
    { id: 2, balances: [{ currency: "SGD", amount: -50 }] },
    { id: 4, balances: [{ currency: "JPY", amount: -1000 }] },
  ];
  it("member I owe", () => {
    expect(balanceWith(2, "SGD", debtors, creditors)).toEqual({
      kind: "you_owe",
      amount: 50,
    });
  });
  it("member who owes me", () => {
    expect(balanceWith(3, "SGD", debtors, creditors)).toEqual({
      kind: "owes_you",
      amount: 12,
    });
  });
  it("debt only in another currency reads settled", () => {
    expect(balanceWith(4, "SGD", debtors, creditors)).toEqual({
      kind: "settled",
      amount: 0,
    });
  });
  it("undefined lists read settled", () => {
    expect(balanceWith(2, "SGD", undefined, undefined).kind).toBe("settled");
  });
});

describe("resolveInitialValues", () => {
  const today = "2026-09-26";
  const draft: RecordPaymentValues = {
    amount: "5",
    currency: "JPY",
    description: "old",
    date: "2026-09-01",
    direction: "received",
    counterpartyId: "9",
  };
  it("empty defaults when no draft and no prefill", () => {
    expect(
      resolveInitialValues({ prefill: {}, draft: null, baseCurrency: "SGD", today })
    ).toEqual({
      amount: "",
      currency: "SGD",
      description: "",
      date: today,
      direction: "paid",
      counterpartyId: "",
    });
  });
  it("draft restored when no prefill", () => {
    expect(
      resolveInitialValues({ prefill: {}, draft, baseCurrency: "SGD", today })
    ).toEqual(draft);
  });
  it("prefill wins over an existing draft", () => {
    expect(
      resolveInitialValues({
        prefill: { direction: "paid", counterpartyId: 2, amount: 587.88, currency: "SGD" },
        draft,
        baseCurrency: "SGD",
        today,
      })
    ).toEqual({
      amount: "587.88",
      currency: "SGD",
      description: "",
      date: today,
      direction: "paid",
      counterpartyId: "2",
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter web exec vitest run src/components/features/Payment/recordPayment.test.ts`
Expected: FAIL with `Failed to resolve import "./recordPayment"`.

- [ ] **Step 3: Implement**

Create `recordPayment.ts`:

```ts
export type PaymentDirection = "paid" | "received";

export type RecordPaymentValues = {
  amount: string;
  currency: string;
  description: string;
  date: string;
  direction: PaymentDirection;
  counterpartyId: string;
};

export type RecordPaymentPrefill = {
  direction?: PaymentDirection;
  counterpartyId?: number;
  amount?: number;
  currency?: string;
};

type BalanceRow = {
  id: number;
  balances: { currency: string; amount: number }[];
};

export type BalanceWith = {
  kind: "you_owe" | "owes_you" | "settled";
  amount: number;
};

/** Mirrors the backend minimum (FINANCIAL_THRESHOLDS.DISPLAY = 0.01). */
export const isValidAmount = (amount: string): boolean => {
  if (!/^\d+(\.\d{1,2})?$/.test(amount)) return false;
  return Number(amount) >= 0.01;
};

export const toParties = (
  direction: PaymentDirection,
  userId: number,
  counterpartyId: number
) =>
  direction === "paid"
    ? { senderId: userId, receiverId: counterpartyId }
    : { senderId: counterpartyId, receiverId: userId };

export const toNotificationNames = (
  direction: PaymentDirection,
  me: { firstName: string },
  counterparty: { firstName: string; username?: string | null }
) =>
  direction === "paid"
    ? {
        creditorName: counterparty.firstName,
        creditorUsername: counterparty.username ?? undefined,
        debtorName: me.firstName,
      }
    : {
        creditorName: me.firstName,
        creditorUsername: undefined,
        debtorName: counterparty.firstName,
      };

const amountIn = (
  rows: BalanceRow[] | undefined,
  memberId: number,
  currency: string
) =>
  rows
    ?.find((r) => r.id === memberId)
    ?.balances.find((b) => b.currency === currency)?.amount;

export const balanceWith = (
  memberId: number,
  currency: string,
  debtors: BalanceRow[] | undefined,
  creditors: BalanceRow[] | undefined
): BalanceWith => {
  const owesMe = amountIn(debtors, memberId, currency);
  if (owesMe !== undefined && owesMe !== 0) {
    return { kind: "owes_you", amount: Math.abs(owesMe) };
  }
  const iOwe = amountIn(creditors, memberId, currency);
  if (iOwe !== undefined && iOwe !== 0) {
    return { kind: "you_owe", amount: Math.abs(iOwe) };
  }
  return { kind: "settled", amount: 0 };
};

export const resolveInitialValues = ({
  prefill,
  draft,
  baseCurrency,
  today,
}: {
  prefill: RecordPaymentPrefill;
  draft: RecordPaymentValues | null;
  baseCurrency: string;
  today: string;
}): RecordPaymentValues => {
  const hasPrefill =
    prefill.counterpartyId !== undefined || prefill.amount !== undefined;
  if (hasPrefill) {
    return {
      amount: prefill.amount !== undefined ? prefill.amount.toFixed(2) : "",
      currency: prefill.currency ?? baseCurrency,
      description: "",
      date: today,
      direction: prefill.direction ?? "paid",
      counterpartyId:
        prefill.counterpartyId !== undefined
          ? String(prefill.counterpartyId)
          : "",
    };
  }
  if (draft) return draft;
  return {
    amount: "",
    currency: baseCurrency,
    description: "",
    date: today,
    direction: "paid",
    counterpartyId: "",
  };
};
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter web exec vitest run src/components/features/Payment/recordPayment.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/features/Payment/recordPayment.ts apps/web/src/components/features/Payment/recordPayment.test.ts
git commit -m "feat(web): record-payment pure logic"
```

---

### Task 6: Record-payment route, page and both steps

**Files:**
- Create: `apps/web/src/routes/_tma/chat.$chatId_.record-payment.tsx`
- Create: `apps/web/src/components/features/Payment/RecordPaymentForm.ts`
- Create: `apps/web/src/components/features/Payment/PaymentAmountStep.tsx`
- Create: `apps/web/src/components/features/Payment/PaymentWhoStep.tsx`
- Create: `apps/web/src/components/features/Payment/RecordPaymentPage.tsx`
- Modify (generated): `apps/web/src/routeTree.gen.ts`

**Interfaces:**
- Consumes: everything from Task 5; `trpc.settlement.createSettlement` with `notificationKind` (Task 3); `useAppForm`, `withForm`, `useFormDraftCache`, `useStartParams` from `@/hooks`; `readFormDraft`, `clearFormDraft` from `@/utils/formDraft`; `formatDateKey`, `formatExpenseDate` from `@utils/date`; `AmountInput`, `CurrencySelectionModal`, `ChatMemberAvatar`.
- Produces: route `/chat/$chatId/record-payment` with search `{ prevTab: "balance" | "transaction"; currentFormStep: number; direction?: "paid" | "received"; counterpartyId?: number; amount?: number; currency?: string; title?: string }`. Tasks 7 and 8 link to it.

- [ ] **Step 1: Route file**

Create `apps/web/src/routes/_tma/chat.$chatId_.record-payment.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import RecordPaymentPage from "@components/features/Payment/RecordPaymentPage";

const searchSchema = z.object({
  prevTab: z.enum(["balance", "transaction"]).catch("balance"),
  currentFormStep: z.number().catch(0),
  direction: z.enum(["paid", "received"]).optional().catch(undefined),
  counterpartyId: z.number().optional().catch(undefined),
  amount: z.number().optional().catch(undefined),
  currency: z.string().length(3).optional().catch(undefined),
  title: z.string().optional(),
});

export const Route = createFileRoute("/_tma/chat/$chatId_/record-payment")({
  component: RouteComponent,
  validateSearch: zodValidator(searchSchema),
});

function RouteComponent() {
  const { chatId } = Route.useParams();
  return <RecordPaymentPage chatId={Number(chatId)} />;
}
```

Check how the other `_tma` routes pass `title` (e.g. `chat.$chatId_.settings.tsx`). If the root layout reads `title` from search to set the header, keep `title` in the schema; otherwise drop it here and in Tasks 7–8.

- [ ] **Step 2: Form options**

Create `RecordPaymentForm.ts`:

```ts
import { formOptions } from "@tanstack/react-form";
import { formatDateKey } from "@utils/date";
import type { RecordPaymentValues } from "./recordPayment";

export const paymentFormOpts = formOptions({
  defaultValues: {
    amount: "",
    currency: "SGD",
    description: "",
    date: formatDateKey(new Date()),
    direction: "paid",
    counterpartyId: "",
  } as RecordPaymentValues,
});

export const PAYMENT_DESCRIPTION_MAX = 60;
```

- [ ] **Step 3: Step 1 (Amount) UI**

Create `PaymentAmountStep.tsx`. It copies the currency cell, amount input and Details section from `Expense/AmountFormStep.tsx:215-410`, without the converted-amount cell, category and repeat. Button handling lives in the page (Step 5), not here.

```tsx
import { hapticFeedback, initData, themeParams, useSignal } from "@telegram-apps/sdk-react";
import { Avatar, Cell, LargeTitle, Section, Subheadline, Text, Textarea } from "@telegram-apps/telegram-ui";
import { Calendar, ChevronRight, Currency } from "lucide-react";
import { useState } from "react";
import { useStore } from "@tanstack/react-form";

import AmountInput from "@components/ui/AmountInput";
import CurrencySelectionModal from "@components/ui/CurrencySelectionModal";
import { withForm } from "@/hooks";
import { trpc } from "@/utils/trpc";
import { formatDateKey, formatExpenseDate } from "@utils/date";
import { paymentFormOpts, PAYMENT_DESCRIPTION_MAX } from "./RecordPaymentForm";

const flagUrl = (countryCode: string) =>
  `https://hatscripts.github.io/circle-flags/flags/${countryCode.toLowerCase()}.svg`;

const PaymentAmountStep = withForm({
  ...paymentFormOpts,
  props: { chatId: 0, showAmountError: false },
  render: function Render({ form, chatId, showAmountError }) {
    const tSubtitleTextColor = useSignal(themeParams.subtitleTextColor);
    const tUserData = useSignal(initData.user);
    const currency = useStore(form.store, (s) => s.values.currency);
    const [currencyModalOpen, setCurrencyModalOpen] = useState(false);

    const { data: dChatData } = trpc.chat.getChat.useQuery({ chatId });
    const { data: supportedCurrencies } =
      trpc.currency.getSupportedCurrencies.useQuery({});
    const info = supportedCurrencies?.find((c) => c.code === currency);

    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label className="flex w-full justify-between px-2">
            <Subheadline weight="2">Amount</Subheadline>
          </label>
          <Section>
            <form.AppField name="currency">
              {(field) => (
                <>
                  <Cell
                    before={
                      info?.countryCode ? (
                        <Avatar size={24}>
                          <img
                            src={flagUrl(info.countryCode)}
                            alt={`${info.name} flag`}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        </Avatar>
                      ) : (
                        <Currency />
                      )
                    }
                    after={<ChevronRight size={20} />}
                    onClick={() => setCurrencyModalOpen(true)}
                  >
                    {info?.name || "Paid in"}
                  </Cell>
                  <CurrencySelectionModal
                    open={currencyModalOpen}
                    onOpenChange={setCurrencyModalOpen}
                    selectedCurrency={currency}
                    onCurrencySelect={field.handleChange}
                    userId={tUserData?.id ?? 0}
                    chatId={chatId}
                    featuredCurrencies={[dChatData?.baseCurrency || "SGD"]}
                  />
                </>
              )}
            </form.AppField>
            <form.AppField name="amount">
              {(field) => (
                <AmountInput
                  value={field.state.value}
                  onChange={field.handleChange}
                  onBlur={field.handleBlur}
                  after={
                    <LargeTitle style={{ color: tSubtitleTextColor }}>
                      {currency}
                    </LargeTitle>
                  }
                  placeholder="0.00"
                  hasError={showAmountError}
                  autoFocus
                />
              )}
            </form.AppField>
          </Section>
        </div>

        <form.AppField name="description">
          {(descriptionField) => (
            <form.AppField name="date">
              {(dateField) => (
                <div className="flex flex-col gap-2">
                  <label className="flex w-full justify-between px-2">
                    <Subheadline weight="2">Details</Subheadline>
                    <span className="text-sm text-gray-500">
                      {descriptionField.state.value.length} / {PAYMENT_DESCRIPTION_MAX} characters
                    </span>
                  </label>
                  <Section>
                    <Textarea
                      className="text-wrap"
                      placeholder="e.g. Concert tickets"
                      value={descriptionField.state.value}
                      onBlur={descriptionField.handleBlur}
                      onChange={(e) => {
                        if (e.target.value.length > PAYMENT_DESCRIPTION_MAX) return;
                        descriptionField.handleChange(e.target.value);
                      }}
                    />
                    <Cell
                      before={<Calendar size={24} style={{ color: tSubtitleTextColor }} />}
                      after={
                        <Text style={{ color: tSubtitleTextColor }}>
                          {dateField.state.value
                            ? formatExpenseDate(new Date(dateField.state.value + "T00:00:00"))
                            : "Select date"}
                        </Text>
                      }
                      className="relative"
                    >
                      <input
                        type="date"
                        value={dateField.state.value}
                        max={formatDateKey(new Date())}
                        onChange={(e) => {
                          dateField.handleChange(e.target.value);
                          hapticFeedback.impactOccurred("light");
                        }}
                        onBlur={dateField.handleBlur}
                        className="absolute inset-0 z-10 size-full cursor-pointer opacity-0"
                      />
                      Transaction Date
                    </Cell>
                  </Section>
                </div>
              )}
            </form.AppField>
          )}
        </form.AppField>
      </div>
    );
  },
});

export default PaymentAmountStep;
```

- [ ] **Step 4: Step 2 (Who) UI**

Create `PaymentWhoStep.tsx`:

```tsx
import { hapticFeedback, initData, useSignal } from "@telegram-apps/sdk-react";
import { Cell, Radio, Section, SegmentedControl } from "@telegram-apps/telegram-ui";
import { useStore } from "@tanstack/react-form";

import ChatMemberAvatar from "@/components/ui/ChatMemberAvatar";
import { withForm } from "@/hooks";
import { trpc } from "@/utils/trpc";
import { formatCurrencyWithCode } from "@/utils/financial";
import { paymentFormOpts } from "./RecordPaymentForm";
import { balanceWith } from "./recordPayment";

const PaymentWhoStep = withForm({
  ...paymentFormOpts,
  props: { chatId: 0 },
  render: function Render({ form, chatId }) {
    const tUserData = useSignal(initData.user);
    const userId = tUserData?.id ?? 0;
    const direction = useStore(form.store, (s) => s.values.direction);
    const currency = useStore(form.store, (s) => s.values.currency);

    const { data: members } = trpc.chat.getMembers.useQuery({ chatId });
    const { data: debtors } = trpc.chat.getDebtorsMultiCurrency.useQuery({ chatId, userId });
    const { data: creditors } = trpc.chat.getCreditorsMultiCurrency.useQuery({ chatId, userId });

    const others = (members ?? []).filter((m) => Number(m.id) !== userId);

    const subtitle = (memberId: number) => {
      const b = balanceWith(memberId, currency, debtors, creditors);
      if (b.kind === "you_owe")
        return <span className="text-red-500">you owe {formatCurrencyWithCode(b.amount, currency)}</span>;
      if (b.kind === "owes_you")
        return <span className="text-green-500">owes you {formatCurrencyWithCode(b.amount, currency)}</span>;
      return <span className="text-gray-500">settled up</span>;
    };

    return (
      <div className="flex flex-col gap-3">
        <form.AppField name="direction">
          {(field) => (
            <SegmentedControl>
              <SegmentedControl.Item
                selected={field.state.value === "paid"}
                onClick={() => {
                  hapticFeedback.selectionChanged();
                  field.handleChange("paid");
                }}
              >
                I paid
              </SegmentedControl.Item>
              <SegmentedControl.Item
                selected={field.state.value === "received"}
                onClick={() => {
                  hapticFeedback.selectionChanged();
                  field.handleChange("received");
                }}
              >
                I received
              </SegmentedControl.Item>
            </SegmentedControl>
          )}
        </form.AppField>

        <form.AppField name="counterpartyId">
          {(field) => (
            <Section
              header={
                <Section.Header large>
                  {direction === "paid" ? "Paid to?" : "Received from?"}
                </Section.Header>
              }
            >
              {others.map((m) => (
                <Cell
                  Component="label"
                  key={String(m.id)}
                  before={<ChatMemberAvatar userId={Number(m.id)} size={48} />}
                  subtitle={subtitle(Number(m.id))}
                  after={
                    <Radio
                      name="counterparty"
                      value={String(m.id)}
                      checked={field.state.value === String(m.id)}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  }
                >
                  {`${m.firstName} ${m.lastName ?? ""}`.trim()}
                </Cell>
              ))}
            </Section>
          )}
        </form.AppField>
      </div>
    );
  },
});

export default PaymentWhoStep;
```

Check the member shape returned by `trpc.chat.getMembers` (it is used in `PayeeFormStep.tsx`). If the fields differ (for example `first_name`), adapt the two name references.

- [ ] **Step 5: Page**

Create `RecordPaymentPage.tsx`:

```tsx
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import {
  backButton,
  hapticFeedback,
  initData,
  mainButton,
  popup,
  secondaryButton,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import { Steps, Subheadline } from "@telegram-apps/telegram-ui";
import { useCallback, useEffect, useState } from "react";

import { cn } from "@utils/cn";
import { formatDateKey, normalizeDateToMidnight } from "@/utils/date";
import { clearFormDraft, readFormDraft } from "@/utils/formDraft";
import { trpc } from "@/utils/trpc";
import { useAppForm, useFormDraftCache } from "@/hooks";
import PaymentAmountStep from "./PaymentAmountStep";
import PaymentWhoStep from "./PaymentWhoStep";
import { paymentFormOpts } from "./RecordPaymentForm";
import {
  isValidAmount,
  resolveInitialValues,
  toNotificationNames,
  toParties,
  type RecordPaymentValues,
} from "./recordPayment";

const routeApi = getRouteApi("/_tma/chat/$chatId_/record-payment");
const STEP_TITLES = ["Amount", "Who"] as const;

const RecordPaymentPage = ({ chatId }: { chatId: number }) => {
  const tUserData = useSignal(initData.user);
  const tButtonColor = useSignal(themeParams.buttonColor);
  const navigate = routeApi.useNavigate();
  const globalNavigate = useNavigate();
  const search = routeApi.useSearch();
  const { prevTab, currentFormStep } = search;
  const userId = tUserData?.id ?? 0;
  const [showAmountError, setShowAmountError] = useState(false);

  const trpcUtils = trpc.useUtils();
  const { data: dChatData } = trpc.chat.getChat.useQuery({ chatId });
  const { data: members } = trpc.chat.getMembers.useQuery({ chatId });
  const createSettlement = trpc.settlement.createSettlement.useMutation();

  const draftKey = `record-payment:${chatId}`;
  const [initialValues] = useState(() =>
    resolveInitialValues({
      prefill: {
        direction: search.direction,
        counterpartyId: search.counterpartyId,
        amount: search.amount,
        currency: search.currency,
      },
      draft: readFormDraft<RecordPaymentValues>(draftKey),
      baseCurrency: dChatData?.baseCurrency ?? "SGD",
      today: formatDateKey(new Date()),
    })
  );

  const backToChat = useCallback(
    (tab: "balance" | "transaction") =>
      globalNavigate({
        to: "/chat/$chatId",
        params: { chatId: chatId.toString() },
        search: { selectedTab: tab },
      }),
    [globalNavigate, chatId]
  );

  const form = useAppForm({
    ...paymentFormOpts,
    defaultValues: initialValues,
    onSubmit: async ({ value }) => {
      const counterparty = members?.find(
        (m) => String(m.id) === value.counterpartyId
      );
      if (!counterparty || !tUserData?.firstName) return;
      mainButton.setParams.ifAvailable({ isLoaderVisible: true, isEnabled: false });
      try {
        await createSettlement.mutateAsync({
          chatId,
          ...toParties(value.direction, userId, Number(value.counterpartyId)),
          amount: Number(value.amount),
          currency: value.currency,
          description: value.description.trim() || undefined,
          sendNotification: true,
          notificationKind: "payment",
          threadId: dChatData?.threadId ? Number(dChatData.threadId) : undefined,
          ...toNotificationNames(
            value.direction,
            { firstName: tUserData.firstName },
            { firstName: counterparty.firstName, username: counterparty.username }
          ),
        });
        await Promise.all([
          trpcUtils.chat.getDebtorsMultiCurrency.invalidate({ chatId, userId }),
          trpcUtils.chat.getCreditorsMultiCurrency.invalidate({ chatId, userId }),
          trpcUtils.chat.getSimplifiedDebtsMultiCurrency.invalidate({ chatId }),
          trpcUtils.settlement.invalidate(),
        ]);
        hapticFeedback.notificationOccurred("success");
        // Reset before clearing: useFormDraftCache re-saves on the
        // post-submit store update otherwise (see AddExpensePage).
        form.reset(resolveInitialValues({
          prefill: {},
          draft: null,
          baseCurrency: dChatData?.baseCurrency ?? "SGD",
          today: formatDateKey(new Date()),
        }));
        clearFormDraft(draftKey);
        backToChat("transaction");
      } catch (error) {
        hapticFeedback.notificationOccurred("error");
        popup.open.ifAvailable({
          message:
            error instanceof Error ? error.message : "Failed to record payment.",
        });
      } finally {
        mainButton.setParams.ifAvailable({ isLoaderVisible: false, isEnabled: true });
      }
    },
  });

  useFormDraftCache(draftKey, form);

  // Back button: step 0 → chat, step 1 → step 0
  useEffect(() => {
    backButton.show.ifAvailable();
    const off = backButton.onClick(() => {
      hapticFeedback.notificationOccurred("success");
      if (currentFormStep === 0) return backToChat(prevTab);
      navigate({ search: (prev) => ({ ...prev, currentFormStep: 0 }) });
    });
    return () => {
      off();
      backButton.hide();
    };
  }, [currentFormStep, prevTab, navigate, backToChat]);

  // Main button text/colour per step
  useEffect(() => {
    const isFinal = currentFormStep === STEP_TITLES.length - 1;
    mainButton.setParams.ifAvailable({
      text: isFinal ? "Record payment" : "Next »",
      isVisible: true,
      isEnabled: true,
      hasShineEffect: isFinal,
      backgroundColor: isFinal ? "#00A86B" : tButtonColor,
    });
  }, [currentFormStep, tButtonColor]);

  // Main button click: validate the current step
  useEffect(() => {
    const off = mainButton.onClick.ifAvailable(() => {
      if (currentFormStep === 0) {
        if (!isValidAmount(form.getFieldValue("amount"))) {
          setShowAmountError(true);
          return hapticFeedback.notificationOccurred("warning");
        }
        setShowAmountError(false);
        hapticFeedback.notificationOccurred("success");
        return navigate({ search: (prev) => ({ ...prev, currentFormStep: 1 }) });
      }
      if (!form.getFieldValue("counterpartyId")) {
        return hapticFeedback.notificationOccurred("warning");
      }
      form.handleSubmit();
    });
    return () => off?.();
  }, [currentFormStep, form, navigate]);

  // Secondary « Back on step 1, hidden otherwise; clean up on unmount
  useEffect(() => {
    const show = currentFormStep > 0;
    secondaryButton.setParams.ifAvailable({ isVisible: show, isEnabled: show, text: "« Back" });
    const off = secondaryButton.onClick.ifAvailable(() => {
      navigate({ search: (prev) => ({ ...prev, currentFormStep: 0 }) });
    });
    return () => off?.();
  }, [currentFormStep, navigate]);

  useEffect(
    () => () => {
      mainButton.setParams.ifAvailable({ isVisible: false, isEnabled: false });
      secondaryButton.setParams.ifAvailable({ isVisible: false, isEnabled: false });
    },
    []
  );

  return (
    <div className="flex flex-col gap-2.5 pb-16">
      <section className="flex w-full flex-col items-center justify-center px-4">
        <Steps count={STEP_TITLES.length} progress={currentFormStep + 1} className="w-full" />
        <div className="flex w-full justify-evenly px-2">
          {STEP_TITLES.map((title, index) => (
            <Subheadline
              key={title}
              level="2"
              weight={index === currentFormStep ? "2" : "3"}
              className={cn("w-1/2 text-center", index !== currentFormStep && "text-gray-500/50")}
            >
              {index + 1}. {title}
            </Subheadline>
          ))}
        </div>
      </section>
      <section className="p-4">
        {currentFormStep === 0 ? (
          <PaymentAmountStep form={form} chatId={chatId} showAmountError={showAmountError} />
        ) : (
          <PaymentWhoStep form={form} chatId={chatId} />
        )}
      </section>
    </div>
  );
};

export default RecordPaymentPage;
```

The backend accepts `date` (added in Task 3). In the `mutateAsync` call above, add:

```ts
          date: normalizeDateToMidnight(new Date(value.date + "T00:00:00")),
```

(`normalizeDateToMidnight` is already imported.)

- [ ] **Step 6: Regenerate the route tree and type-check**

Run: `pnpm --filter web exec tsc --noEmit` (if it complains about the unknown route id, run `pnpm --filter web build` once so the TanStack plugin regenerates `routeTree.gen.ts`, then re-run tsc).
Expected: no errors.

- [ ] **Step 7: Run the web tests**

Run: `pnpm --filter web exec vitest run`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add "apps/web/src/routes/_tma/chat.\$chatId_.record-payment.tsx" apps/web/src/components/features/Payment apps/web/src/routeTree.gen.ts
git commit -m "feat(web): record payment two-step form"
```

---

### Task 7: GroupPage split button

**Files:**
- Create: `apps/web/src/components/features/Payment/GroupActionButtons.tsx`
- Test: `apps/web/src/components/features/Payment/GroupActionButtons.test.tsx`
- Modify: `apps/web/src/components/features/Chat/GroupPage.tsx:36,431`

**Interfaces:**
- Consumes: the route from Task 6.
- Produces: `<GroupActionButtons chatId={number} selectedTab={"balance" | "transaction"} />`

- [ ] **Step 1: Write the failing test**

Create `GroupActionButtons.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import GroupActionButtons from "./GroupActionButtons";

afterEach(() => cleanup());

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, search }: any) => (
    <a data-to={to} data-title={search?.title}>{children}</a>
  ),
}));
vi.mock("@telegram-apps/sdk-react", () => ({
  hapticFeedback: { impactOccurred: vi.fn() },
  themeParams: { buttonTextColor: {}, buttonColor: {}, secondaryBgColor: {} },
  useSignal: vi.fn(() => "#000"),
}));
vi.mock("@telegram-apps/telegram-ui", () => ({
  Button: ({ children }: any) => <span>{children}</span>,
}));

describe("GroupActionButtons", () => {
  it("renders Add expense and Payment links side by side", () => {
    render(<GroupActionButtons chatId={-100} selectedTab="balance" />);
    const add = screen.getByText("Add expense").closest("a")!;
    const pay = screen.getByText("💸 Payment").closest("a")!;
    expect(add.getAttribute("data-to")).toBe("/chat/$chatId/add-expense");
    expect(pay.getAttribute("data-to")).toBe("/chat/$chatId/record-payment");
    expect(pay.getAttribute("data-title")).toBe("💸 Record payment");
  });
});
```

Run: `pnpm --filter web exec vitest run src/components/features/Payment/GroupActionButtons.test.tsx`
Expected: FAIL, the import cannot be resolved.

- [ ] **Step 2: Implement**

Create `GroupActionButtons.tsx`:

```tsx
import { Link } from "@tanstack/react-router";
import { hapticFeedback, themeParams, useSignal } from "@telegram-apps/sdk-react";
import { Button } from "@telegram-apps/telegram-ui";
import { Plus } from "lucide-react";

interface GroupActionButtonsProps {
  chatId: number;
  selectedTab: "balance" | "transaction";
}

const GroupActionButtons = ({ chatId, selectedTab }: GroupActionButtonsProps) => {
  const tButtonTextColor = useSignal(themeParams.buttonTextColor);
  const tButtonColor = useSignal(themeParams.buttonColor);

  return (
    <div className="flex gap-2 p-4">
      <Link
        className="block flex-1"
        onClick={() => hapticFeedback.impactOccurred("light")}
        to="/chat/$chatId/add-expense"
        params={{ chatId: chatId.toString() }}
        search={{ prevTab: selectedTab, title: "+ Add expense" }}
      >
        <Button
          size="l"
          stretched
          before={<Plus size={24} />}
          className="w-full rounded-xl"
          style={{ color: tButtonTextColor, backgroundColor: tButtonColor }}
        >
          Add expense
        </Button>
      </Link>
      <Link
        className="block flex-1"
        onClick={() => hapticFeedback.impactOccurred("light")}
        to="/chat/$chatId/record-payment"
        params={{ chatId: chatId.toString() }}
        search={{ prevTab: selectedTab, currentFormStep: 0, title: "💸 Record payment" }}
      >
        <Button size="l" stretched mode="bezeled" className="w-full rounded-xl">
          💸 Payment
        </Button>
      </Link>
    </div>
  );
};

export default GroupActionButtons;
```

In `GroupPage.tsx`, replace the `AddExpenseButton` import with `import GroupActionButtons from "../Payment/GroupActionButtons";` and replace `<AddExpenseButton chatId={chatId} selectedTab={selectedTab} />` with `<GroupActionButtons chatId={chatId} selectedTab={selectedTab} />`. Leave `UserPage.tsx` untouched.

- [ ] **Step 3: Run tests + type-check**

Run: `pnpm --filter web exec vitest run && pnpm --filter web exec tsc --noEmit`
Expected: all PASS, no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/features/Payment/GroupActionButtons.tsx apps/web/src/components/features/Payment/GroupActionButtons.test.tsx apps/web/src/components/features/Chat/GroupPage.tsx
git commit -m "feat(web): split Add expense / Payment buttons on group page"
```

---

### Task 8: "Other options" section in ToPay / ToReceive

**Files:**
- Create: `apps/web/src/components/features/Chat/OtherOptionsSection.tsx`
- Create: `apps/web/src/components/features/Chat/DifferentAmountCell.tsx`
- Test: `apps/web/src/components/features/Chat/DifferentAmountCell.test.tsx`
- Modify: `apps/web/src/components/features/Chat/MoveDebtEntry.tsx` (`bare` prop)
- Modify: `apps/web/src/components/features/Chat/ToPayModal.tsx:~288-300`
- Modify: `apps/web/src/components/features/Chat/ToReceiveModal.tsx:~305-316`

**Interfaces:**
- Consumes: the route + search from Task 6.
- Produces:
  - `<OtherOptionsSection>{children}</OtherOptionsSection>`
  - `<DifferentAmountCell chatId direction counterpartyId amount currency />`
  - `MoveDebtEntry` prop `bare?: boolean` (default `false`)

- [ ] **Step 1: Write the failing test**

Create `DifferentAmountCell.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { DifferentAmountCell } from "./DifferentAmountCell";

afterEach(() => cleanup());

const navigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
vi.mock("@telegram-apps/sdk-react", () => ({
  hapticFeedback: { impactOccurred: { ifAvailable: vi.fn() } },
}));
vi.mock("@telegram-apps/telegram-ui", () => ({
  Cell: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
  Navigation: () => null,
  Text: ({ children }: any) => <span>{children}</span>,
}));

describe("DifferentAmountCell", () => {
  it("ToPay: 'Pay a different amount' opens the form prefilled on step 1", () => {
    render(
      <DifferentAmountCell chatId={-100} direction="paid" counterpartyId={2} amount={587.88} currency="SGD" />
    );
    fireEvent.click(screen.getByText("Pay a different amount"));
    expect(navigate).toHaveBeenCalledWith({
      to: "/chat/$chatId/record-payment",
      params: { chatId: "-100" },
      search: {
        prevTab: "balance",
        currentFormStep: 0,
        direction: "paid",
        counterpartyId: 2,
        amount: 587.88,
        currency: "SGD",
        title: "💸 Record payment",
      },
    });
  });

  it("ToReceive: label reads 'Received a different amount'", () => {
    render(
      <DifferentAmountCell chatId={-100} direction="received" counterpartyId={3} amount={12} currency="SGD" />
    );
    expect(screen.getByText("Received a different amount")).toBeTruthy();
  });
});
```

Run: `pnpm --filter web exec vitest run src/components/features/Chat/DifferentAmountCell.test.tsx`
Expected: FAIL, the import cannot be resolved.

- [ ] **Step 2: Implement the cell and section**

Create `DifferentAmountCell.tsx`:

```tsx
import { useNavigate } from "@tanstack/react-router";
import { hapticFeedback } from "@telegram-apps/sdk-react";
import { Cell, Navigation, Text } from "@telegram-apps/telegram-ui";
import { Pencil } from "lucide-react";
import type { PaymentDirection } from "../Payment/recordPayment";

interface DifferentAmountCellProps {
  chatId: number;
  direction: PaymentDirection;
  counterpartyId: number;
  amount: number;
  currency: string;
}

export function DifferentAmountCell({
  chatId,
  direction,
  counterpartyId,
  amount,
  currency,
}: DifferentAmountCellProps) {
  const navigate = useNavigate();
  return (
    <Cell
      before={<Pencil size={20} className="text-zinc-400" />}
      after={<Navigation />}
      onClick={() => {
        hapticFeedback.impactOccurred.ifAvailable("light");
        navigate({
          to: "/chat/$chatId/record-payment",
          params: { chatId: chatId.toString() },
          search: {
            prevTab: "balance",
            currentFormStep: 0,
            direction,
            counterpartyId,
            amount,
            currency,
            title: "💸 Record payment",
          },
        });
      }}
    >
      <Text weight="2">
        {direction === "paid" ? "Pay a different amount" : "Received a different amount"}
      </Text>
    </Cell>
  );
}
```

Create `OtherOptionsSection.tsx`:

```tsx
import { Section } from "@telegram-apps/telegram-ui";
import type { ReactNode } from "react";

/**
 * Groups the secondary popup actions (different amount, move debt) under
 * one header, padded so the native Copy Phone / Settled bar never covers
 * the last cell.
 */
export function OtherOptionsSection({ children }: { children: ReactNode }) {
  return (
    <div
      className="px-3 pt-2"
      style={{ paddingBottom: "calc(24px + var(--tg-viewport-safe-area-inset-bottom, 0px))" }}
    >
      <Section header="Other options">{children}</Section>
    </div>
  );
}
```

Check which safe-area CSS variable the app uses elsewhere (`grep -rn "safe-area" apps/web/src`) and use that name. The fallback `0px` keeps the padding at 24px when it is absent.

- [ ] **Step 3: `bare` prop on MoveDebtEntry**

In `MoveDebtEntry.tsx`, add `bare?: boolean` to the props interface and destructure it with `bare = false`. Replace the returned JSX:

```tsx
  const content = (
    <>
      <Cell
        before={<ArrowRightLeft size={20} className="text-zinc-400" />}
        after={<Navigation />}
        onClick={() => {
          hapticFeedback.impactOccurred.ifAvailable("light");
          setBoth(true);
        }}
      >
        <Text weight="2">Move to another group</Text>
      </Cell>
      <MoveDebtSheet
        open={open}
        move={open ? move : null}
        counterpartyUserId={counterpartyUserId}
        counterpartyName={counterpartyName}
        onOpenChange={(o) => setBoth(o)}
        onAfterMutate={handleAfterMutate}
      />
    </>
  );

  return bare ? content : <Section className="px-3">{content}</Section>;
```

If `MoveDebtEntry` returns `null` early (e.g. no eligible targets), keep that early return unchanged.

- [ ] **Step 4: Wire into both modals**

In `ToPayModal.tsx`, replace the `<MoveDebtEntry ... />` block with:

```tsx
        <OtherOptionsSection>
          <DifferentAmountCell
            chatId={chatId}
            direction="paid"
            counterpartyId={member.id}
            amount={absAmountOwed}
            currency={currency}
          />
          <MoveDebtEntry
            bare
            sourceChatId={chatId}
            sourceChatTitle={dChatData?.title ?? ""}
            currency={currency}
            amount={absAmountOwed}
            counterpartyUserId={member.id}
            counterpartyName={member.firstName}
            callerOwes={true}
            onOpenChange={setMoveOpen}
            onMoved={() => onOpenChange(false)}
          />
        </OtherOptionsSection>
```

In `ToReceiveModal.tsx`, do the same with `direction="received"`, `amount={absAmountLent}`, `callerOwes={false}`.

Imports for both:

```tsx
import { OtherOptionsSection } from "./OtherOptionsSection";
import { DifferentAmountCell } from "./DifferentAmountCell";
```

- [ ] **Step 5: Run tests + type-check**

Run: `pnpm --filter web exec vitest run && pnpm --filter web exec tsc --noEmit`
Expected: all PASS (including `MoveDebtSheet.test.tsx`), no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/features/Chat/OtherOptionsSection.tsx apps/web/src/components/features/Chat/DifferentAmountCell.tsx apps/web/src/components/features/Chat/DifferentAmountCell.test.tsx apps/web/src/components/features/Chat/MoveDebtEntry.tsx apps/web/src/components/features/Chat/ToPayModal.tsx apps/web/src/components/features/Chat/ToReceiveModal.tsx
git commit -m "feat(web): Other options section with pay/received a different amount"
```

---

### Task 9: Full verification, PR, and UAT

No new code. This task gates merge.

- [ ] **Step 1: Repo-wide checks**

Run: `pnpm lint && pnpm --filter @dko/trpc exec vitest run && pnpm --filter web exec vitest run && pnpm --filter @dko/trpc exec tsc --noEmit && pnpm --filter web exec tsc --noEmit`
Expected: all green. Fix anything red before continuing.

- [ ] **Step 2: Push and open the PR (do NOT arm auto-merge; UAT is pending)**

```bash
git push -u origin feat/record-payment
gh pr create --title "feat: record payment (ad-hoc settlements)" --body-file <humanized body>
```

The PR body uses the `pr-description` skill, is run through `humanizer`, starts with the spec and deck Blob links, and ends with the Claude Code attribution footer. Tag `@claude` for a merge-readiness review in a PR comment.

- [ ] **Step 3: Start the dev stack**

Confirm Postgres is up and `pnpm dev:tunnel` is running (lambda, web, bot polling). Start them if not.

- [ ] **Step 4: Automated staging UAT (subagent)**

Against the real dev server over HTTP, as a user in the staging test group:

1. `createSettlement` with `notificationKind: "payment"` in both directions (caller = sender, then caller = receiver). Assert the settlement row, the change in `getDebtorsMultiCurrency`/`getCreditorsMultiCurrency`, the text of the Bot API message (tags the non-recorder), and that the button URL payload decodes to `st` + the id.
2. A partial payment (less than the debt) and a no-debt payment (to a settled member). Assert the balance moves by exactly the amount.
3. Default `notificationKind` still posts "Great news" plus the button.
4. `deleteSettlement` removes the group message.
5. Existing `e`, `s` and `rt` deep links still open the right screen.
6. Clean up every created row.

- [ ] **Step 5: Manual UAT (AskUserQuestion, one step at a time)**

In Telegram:

- the split button on the group page (including on the narrowest phone available),
- step 1 and step 2 of the form,
- "Pay a different amount" opening the form prefilled,
- the "Other options" section clearing the native bar in both popups,
- how both group messages render,
- tapping View payment to open the settlement's details popup.

- [ ] **Step 6: Merge only after the user says "ok merge"**

```bash
gh pr merge --auto --squash --delete-branch
```
