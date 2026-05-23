# Shared API Layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement slice-by-slice. Each slice follows **Red → Green → Blue** TDD. Use an isolated git worktree per slice (`using-git-worktrees` skill).

**Goal:** Extract `@bananasplitz/api-client` and `@bananasplitz/api-ops` so CLI and Raycast share one implementation of all 35 API operations, with optional incremental web adoption later.

**Architecture:** Transport utilities in `api-client`; domain ops as pure `(trpc, input) => Promise<result>` functions in `api-ops`; apps keep argv/tool/UI shells and delegate. See design doc: `docs/plans/2026-05-22-shared-api-layer-design.md`.

**Tech Stack:** Vitest, TypeScript ESM, `@trpc/client` 11.x, superjson, `@dko/trpc` (AppRouter types), pnpm workspaces, turbo.

**TDD cycle (every task group):**

| Phase | Action | Gate |
|-------|--------|------|
| **Red** | Write failing test | Test fails for the *expected* reason (missing export, wrong mock call) |
| **Green** | Minimal implementation | New package tests pass |
| **Blue** | Wire adapters, delete duplicates, refactor | Full suite + parity check pass |

---

## Pre-flight

- [ ] Create worktree: `refactor/shared-api-layer` from `main`
- [ ] Confirm baseline green:

```bash
pnpm --filter @banananasplitz/cli test
pnpm --filter bananasplitz check-parity
turbo check-types
```

---

## SLICE-00 — `@bananasplitz/api-client` walking skeleton

**Demoable as:** CLI + Raycast build and run with shared imports; no command behavior change.

### Task 0.1: Scaffold `packages/api-client`

**Files:**
- Create: `packages/api-client/package.json`
- Create: `packages/api-client/tsconfig.json`
- Create: `packages/api-client/vitest.config.ts`
- Create: `packages/api-client/src/index.ts`

**Step 1 (Red):** Create failing test `packages/api-client/src/serialize.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { serializeForJson } from "./serialize.js";

describe("serializeForJson", () => {
  it("stringifies BigInt values", () => {
    expect(serializeForJson({ id: 1n })).toBe(
      '{\n  "id": "1"\n}',
    );
  });
});
```

**Step 2:** Run `pnpm --filter @bananasplitz/api-client test` → FAIL (module not found).

**Step 3 (Green):** Implement `packages/api-client/src/serialize.ts`:

```typescript
function replacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

export function serializeForJson(value: unknown, pretty = true): string {
  return JSON.stringify(value, replacer, pretty ? 2 : undefined);
}
```

Export from `index.ts`. Add `package.json`:

```json
{
  "name": "@bananasplitz/api-client",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "check-types": "tsc --noEmit"
  },
  "dependencies": {
    "@dko/trpc": "workspace:*",
    "@trpc/client": "11.0.0",
    "superjson": "^2.2.2"
  },
  "devDependencies": {
    "@repo/typescript-config": "workspace:*",
    "typescript": "5.8.2",
    "vitest": "^3.0.0"
  }
}
```

**Step 4:** Test passes.

**Step 5 (Blue):** Port `createApiKeyClient` and `resolveChatId`.

Red — `packages/api-client/src/scope.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { resolveChatId } from "./scope.js";
import type { TrpcClient } from "./client.js";

describe("resolveChatId", () => {
  it("returns explicit chatId when provided", async () => {
    const trpc = {} as TrpcClient;
    await expect(resolveChatId(trpc, "42")).resolves.toBe(42);
  });

  it("uses apiKey scope when chatId omitted", async () => {
    const query = vi.fn().mockResolvedValue({ scoped: true, chatId: "99" });
    const trpc = { apiKey: { getScope: { query } } } as unknown as TrpcClient;
    await expect(resolveChatId(trpc)).resolves.toBe(99);
    expect(query).toHaveBeenCalled();
  });

  it("throws when chatId required but missing", async () => {
    const query = vi.fn().mockResolvedValue({ scoped: false });
    const trpc = { apiKey: { getScope: { query } } } as unknown as TrpcClient;
    await expect(resolveChatId(trpc)).rejects.toThrow(/required/i);
  });
});
```

Green — implement `client.ts` + `scope.ts` (merge CLI + Raycast variants; accept `string | number | undefined`).

Blue — update consumers:

| File | Change |
|------|--------|
| `apps/cli/package.json` | Add `"@bananasplitz/api-client": "workspace:*"` |
| `apps/cli/src/client.ts` | Re-export from `@bananasplitz/api-client` or delete and update imports |
| `apps/cli/src/scope.ts` | Delete; import from `@bananasplitz/api-client` |
| `apps/cli/src/output.ts` | Use `serializeForJson` for stdout (keep `success`/`error`/`run` here) |
| `apps/raycast/package.json` | Add workspace dep |
| `apps/raycast/src/lib/trpc.ts` | Use `createApiKeyClient` from shared package |
| `apps/raycast/src/lib/tools/scope.ts` | Delete; import shared |
| `apps/raycast/src/lib/tools/serialize.ts` | Delete; import shared |

**Verify:**

```bash
pnpm install
pnpm --filter @bananasplitz/api-client test
pnpm --filter @banananasplitz/cli test
pnpm --filter bananasplitz check-types
pnpm --filter bananasplitz check-parity
```

**Commit:** `refactor(api-client): extract shared transport utilities`

---

## SLICE-01 — Pilot op: `getChat`

**Demoable as:** `banana get-chat --chat-id <id>` and Raycast get-chat tool unchanged.

### Task 1.1: Scaffold `packages/api-ops`

**Files:**
- Create: `packages/api-ops/package.json` (deps: `@bananasplitz/api-client`, `@dko/trpc`, vitest)
- Create: `packages/api-ops/src/index.ts`
- Create: `packages/api-ops/src/ops/chat.ts`

### Task 1.2: Red — failing op test

Create `packages/api-ops/src/ops/chat.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { getChat } from "./chat.js";
import type { TrpcClient } from "@bananasplitz/api-client";

describe("getChat", () => {
  it("calls trpc.chat.getChat with resolved chatId", async () => {
    const query = vi.fn().mockResolvedValue({ id: 1, title: "Trip" });
    const trpc = { chat: { getChat: { query } } } as unknown as TrpcClient;

    const result = await getChat(trpc, { chatId: 123 });

    expect(query).toHaveBeenCalledWith({ chatId: 123 });
    expect(result).toEqual({ id: 1, title: "Trip" });
  });

  it("resolves chatId via scope when omitted", async () => {
    const scopeQuery = vi.fn().mockResolvedValue({ scoped: true, chatId: "555" });
    const chatQuery = vi.fn().mockResolvedValue({ id: 555 });
    const trpc = {
      apiKey: { getScope: { query: scopeQuery } },
      chat: { getChat: { query: chatQuery } },
    } as unknown as TrpcClient;

    await getChat(trpc, {});

    expect(chatQuery).toHaveBeenCalledWith({ chatId: 555 });
  });
});
```

Run → FAIL.

### Task 1.3: Green — minimal op

```typescript
// packages/api-ops/src/ops/chat.ts
import { resolveChatId, type TrpcClient } from "@bananasplitz/api-client";

export interface GetChatInput {
  chatId?: number | string;
}

export async function getChat(trpc: TrpcClient, input: GetChatInput) {
  const chatId = await resolveChatId(trpc, input.chatId);
  return trpc.chat.getChat.query({ chatId });
}
```

Export from `index.ts`. Tests pass.

### Task 1.4: Blue — wire adapters

**CLI** — `apps/cli/src/commands/chat.ts` `get-chat` execute:

```typescript
import { getChat } from "@bananasplitz/api-ops";

execute: (opts, trpc) =>
  run("get-chat", () =>
    getChat(trpc, { chatId: opts["chat-id"] as string | undefined }),
  ),
```

**Raycast** — `apps/raycast/src/tools/get-chat.ts`:

```typescript
import { getChat } from "@bananasplitz/api-ops";

return runTool("get-chat", input, (trpc) => getChat(trpc, { chatId: input.chatId }));
```

**Verify:** CLI `chat.test.ts` still passes (may need to mock `@bananasplitz/api-ops` or keep testing via execute — prefer keeping execute tests as integration of adapter).

**Commit:** `refactor(api-ops): extract getChat op`

---

## SLICE-02 — Chat domain (4 remaining ops)

Repeat RGB per op (can batch in one PR if tests stay focused):

| Op function | CLI command | tRPC procedure |
|-------------|-------------|----------------|
| `listChats` | `list-chats` | `chat.getAllChats` |
| `getDebts` | `get-debts` | `chat.getBulkChatDebts` |
| `getSimplifiedDebts` | `get-simplified-debts` | `chat.getSimplifiedDebts` |
| `updateChatSettings` | `update-chat-settings` | `chat.updateChat` |

**Red example** — `getSimplifiedDebts` validation (currency required):

```typescript
it("throws when currency missing", async () => {
  const trpc = {} as TrpcClient;
  await expect(getSimplifiedDebts(trpc, { chatId: 1 })).rejects.toThrow(/currency/i);
});
```

Move validation from CLI `error("missing_option", ...)` into op (throw `ApiValidationError`); CLI adapter catches and maps to existing error shape:

```typescript
// apps/cli adapter pattern for validation errors
try {
  return await getSimplifiedDebts(trpc, input);
} catch (e) {
  if (e instanceof ApiValidationError && e.code === "missing_field") {
    return error("missing_option", e.message, "get-simplified-debts");
  }
  throw e;
}
```

**Verify:** `apps/cli/src/commands/chat.test.ts` full pass.

**Commit:** `refactor(api-ops): extract chat domain ops`

---

## SLICE-03 — Me domain

| Op | CLI command |
|----|-------------|
| `listMyBalances` | `list-my-balances` |
| `listMySpending` | `list-my-spending` |
| `listCounterpartyBalances` | `list-counterparty-balances` |
| `settleAllWith` | `settle-all-with` |

**Red:** Port tests from `apps/cli/src/commands/me.test.ts` into `packages/api-ops/src/ops/me.test.ts`.

**Blue:** Slim `me.ts` commands to adapters; delete duplicated logic.

**Commit:** `refactor(api-ops): extract me domain ops`

---

## SLICE-04 — Expense domain

**Split if needed:** 04a (read) + 04b (write).

### 04a — Read ops

`listExpenses`, `getExpense`, `getNetShare`, `getTotals`, `listCategories`

### 04b — Write ops + helpers

**Red first for helper** — `packages/api-ops/src/helpers/expense-update.test.ts`:

Port scenarios from CLI expense tests covering:
- partial patch merges with existing expense
- not-found when `splitMode == null`
- customSplits preservation for non-EQUAL modes

**Green** — move `applyExpensePartialUpdate` from CLI + Raycast into `helpers/expense-update.ts`.

**Ops:** `createExpense`, `updateExpense`, `deleteExpense`, `bulkImportExpenses`, `bulkUpdateExpenses`

**Blue:** Delete `apps/raycast/src/lib/tools/expense-update.ts`; delete inline helper from `apps/cli/src/commands/expense.ts`.

**Also extract** `packages/api-ops/src/parse.ts` from Raycast `parse.ts` (and any CLI inline parsers).

**Commit(s):** `refactor(api-ops): extract expense read ops` / `... write ops`

---

## SLICE-05 — Settlement domain

Ops: `listSettlements`, `createSettlement`, `deleteSettlement`, `settleAllDebts`

**Red:** Port `apps/cli/src/commands/settlement.test.ts` tests.

**Commit:** `refactor(api-ops): extract settlement ops`

---

## SLICE-06 — Snapshot domain

Ops: `listSnapshots`, `getSnapshot`, `createSnapshot`, `updateSnapshot`, `deleteSnapshot`

**Red:** Port `snapshot.test.ts`.

**Commit:** `refactor(api-ops): extract snapshot ops`

---

## SLICE-07 — Recurring domain

Ops: `listRecurringExpenses`, `getRecurringExpense`, `updateRecurringExpense`, `cancelRecurringExpense`

Extract `buildRecurrenceParams` helper if duplicated between CLI and Raycast.

**Commit:** `refactor(api-ops): extract recurring ops`

---

## SLICE-08 — Reminder + currency + category

Ops: `sendGroupReminder`, `sendDebtReminder`, `getExchangeRate`, (category already in 04a if `listCategories`)

**Red:** Port `reminder.test.ts`, `currency.test.ts`.

**Commit:** `refactor(api-ops): extract reminder and currency ops`

---

## SLICE-09 — Hardening

### Task 9.1: Ops coverage gate

Extend `apps/raycast/scripts/check-cli-parity.ts` OR add `packages/api-ops/scripts/check-op-coverage.ts`:

- For each of 35 CLI command names, assert a matching export exists in `@bananasplitz/api-ops` (naming map: `get-chat` → `getChat`).

```typescript
const COMMAND_TO_OP: Record<string, string> = {
  "get-chat": "getChat",
  // ...
};
```

Add script to `packages/api-ops/package.json`: `"check-coverage": "tsx scripts/check-op-coverage.ts"`

Wire into CI (turbo `test` or dedicated job).

### Task 9.2: Contributor docs

Create `packages/api-ops/AGENTS.md`:

- How to add a new op (Red → Green → Blue)
- CLI + Raycast adapter checklist
- Parity + coverage invariants

Update root `AGENTS.md` with short "Shared API layer" section linking to design doc.

### Task 9.3: Final dedup audit

```bash
# Should return no results after refactor:
rg "Mirrors apps/cli" apps/raycast/
rg "ported from apps/cli" apps/raycast/
```

**Commit:** `chore(api-ops): add coverage check and agent docs`

---

## SLICE-10 — Web pilot (optional follow-up)

**Not blocking CLI/Raycast refactor.**

### Task 10.1: Vanilla client wrapper for ops in web

Web keeps `createTRPCReact` for queries. For one mutation pilot:

```typescript
// apps/web/src/hooks/useUpdateChatSettings.ts
import { updateChatSettings } from "@bananasplitz/api-ops";
import { trpcClient } from "@/utils/trpc";

export function useUpdateChatSettingsMutation() {
  return trpc.chat.updateChat.useMutation({
    mutationFn: (input) => updateChatSettings(trpcClient, input),
  });
}
```

**Red:** Component or hook test asserting op is invoked.

**Blue:** Replace inline mutation logic in one settings component.

Document pattern in design doc; migrate remaining mutations incrementally (separate PRs per feature area).

---

## Adapter patterns (copy-paste reference)

### CLI command adapter

```typescript
import { someOp } from "@bananasplitz/api-ops";
import { run, error } from "../output.js";
import { ApiValidationError } from "@bananasplitz/api-ops";

execute: (opts, trpc) =>
  run("some-command", async () => {
    try {
      return await someOp(trpc, {
        chatId: opts["chat-id"] as string | undefined,
        // map kebab-case flags → op input
      });
    } catch (e) {
      if (e instanceof ApiValidationError) {
        return error("missing_option", e.message, "some-command");
      }
      throw e;
    }
  }),
```

### Raycast tool adapter

```typescript
import { someOp } from "@bananasplitz/api-ops";
import { runTool, withToolErrors } from "../lib/tools/run-tool";

export default async function tool(input: Input) {
  return withToolErrors("some-command", input, () =>
    runTool("some-command", input, (trpc) => someOp(trpc, input)),
  );
}
```

---

## CLI version bump policy (each slice touching CLI runtime)

Per `apps/cli/AGENTS.md`:

1. Patch bump `apps/cli/package.json`
2. Match `skills/banana-cli/SKILL.md` frontmatter version
3. Add `CHANGELOG.md` entry under `[Unreleased]` → version on release PR

Category: **Changed** — "Internal refactor: command logic moved to `@bananasplitz/api-ops` (no output change)."

---

## PR checklist (every slice)

- [ ] Red: new tests failed before implementation
- [ ] Green: `@bananasplitz/api-ops` / `api-client` tests pass
- [ ] Blue: adapters wired; duplicate files removed
- [ ] `pnpm --filter @banananasplitz/cli test`
- [ ] `pnpm --filter bananasplitz check-parity`
- [ ] `turbo check-types`
- [ ] CLI version + CHANGELOG if CLI runtime touched
- [ ] No skill.md capability table changes (no user-facing command changes)

---

## Execution order summary

| Slice | PR scope | Est. ops |
|-------|----------|----------|
| SLICE-00 | api-client extract | — |
| SLICE-01 | getChat pilot | 1 |
| SLICE-02 | chat | 4 |
| SLICE-03 | me | 4 |
| SLICE-04 | expense | ~12 |
| SLICE-05 | settlement | 4 |
| SLICE-06 | snapshot | 5 |
| SLICE-07 | recurring | 4 |
| SLICE-08 | reminder + currency | 3 |
| SLICE-09 | hardening | — |
| SLICE-10 | web pilot (optional) | — |

**Total: 35 ops** across CLI/Raycast — full coverage after SLICE-08.

---

## Execution handoff

Plan complete. Two execution options:

1. **Subagent-driven (recommended)** — one subagent per slice, review between slices, using `using-git-worktrees` for isolation.
2. **Inline** — execute slice-by-slice in a single session with checkpoints after each Blue phase.

Which approach do you want to start with?
