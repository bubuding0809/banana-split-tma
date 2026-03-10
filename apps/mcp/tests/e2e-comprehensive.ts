import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@dko/trpc";

const API_URL = "http://localhost:8081/api/trpc";
const SUPERADMIN_KEY = "test-superadmin-key-123";

function makeClient(apiKey: string) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: API_URL,
        transformer: superjson,
        headers() {
          return { "x-api-key": apiKey };
        },
      }),
    ],
  });
}

const superadmin = makeClient(SUPERADMIN_KEY);

let passed = 0;
let failed = 0;

function ok(name: string) {
  passed++;
  console.log(`  ✓ ${name}`);
}
function fail(name: string, err: unknown) {
  failed++;
  console.error(`  ✗ ${name}:`, err instanceof Error ? err.message : err);
}

// Test Data Constants
const CHAT_A = 100000;
const CHAT_B = 200000;
const USER_1 = 101; // Alice
const USER_2 = 102; // Bob
const USER_3 = 103; // Charlie

async function setupTestData() {
  console.log("\n=== Setting up test data (as superadmin) ===");

  // 1. Create Users
  for (const id of [USER_1, USER_2, USER_3]) {
    try {
      await superadmin.user.createUser.mutate({
        userId: id,
        firstName: `User${id}`,
        lastName: "Test",
        userName: `user${id}`,
      });
    } catch (e: any) {
      if (!e.message?.includes("already exists")) throw e;
    }
  }
  ok("Created 3 users");

  // 2. Create Chats
  for (const id of [CHAT_A, CHAT_B]) {
    try {
      await superadmin.chat.createChat.mutate({
        chatId: id,
        chatTitle: `Test Chat ${id}`,
        chatType: "group",
      });
    } catch (e: any) {
      if (!e.message?.includes("already exists")) throw e;
    }
  }
  ok("Created 2 chats");

  // 3. Add Members
  for (const chatId of [CHAT_A, CHAT_B]) {
    for (const userId of [USER_1, USER_2, USER_3]) {
      try {
        await superadmin.chat.addMember.mutate({ chatId, userId });
      } catch (e: any) {
        if (!e.message?.includes("already a member")) throw e;
      }
    }
  }
  ok("Added users to chats");

  // 4. Generate Scoped API Key for CHAT_A
  const result = await superadmin.apiKey.generate.mutate({
    chatId: CHAT_A,
    createdById: USER_1,
  });
  ok(`Generated scoped API key for Chat ${CHAT_A}`);

  return makeClient(result.rawKey);
}

async function runComprehensiveTests(scoped: ReturnType<typeof makeClient>) {
  console.log("\n=== Running Comprehensive Scoped Tests ===\n");

  // --- 1. Scope Detection ---
  try {
    const scope = await scoped.apiKey.getScope.query();
    if (scope.scoped && scope.chatId === CHAT_A)
      ok("1. getScope correctly identifies chat");
    else fail("1. getScope", "Wrong scope returned");
  } catch (e) {
    fail("1. getScope", e);
  }

  // --- 2. Chat Reads ---
  try {
    const chat = await scoped.chat.getChat.query({ chatId: CHAT_A });
    if (chat.title === `Test Chat ${CHAT_A}`)
      ok("2. getChat on allowed chat succeeds");
    else fail("2. getChat", "Returned wrong chat");
  } catch (e) {
    fail("2. getChat", e);
  }

  try {
    await scoped.chat.getChat.query({ chatId: CHAT_B });
    fail("3. getChat cross-chat", "Should have thrown FORBIDDEN");
  } catch (e: any) {
    if (e.data?.code === "FORBIDDEN")
      ok("3. getChat cross-chat correctly blocked");
    else fail("3. getChat cross-chat", e);
  }

  // --- 3. Chat Writes (Updates) ---
  try {
    await scoped.chat.updateChat.mutate({
      chatId: CHAT_A,
      title: "Updated Chat A",
    });
    ok("4. updateChat on allowed chat succeeds");
  } catch (e) {
    fail("4. updateChat", e);
  }

  try {
    await scoped.chat.updateChat.mutate({ chatId: CHAT_B, title: "Hacked" });
    fail("5. updateChat cross-chat", "Should have thrown FORBIDDEN");
  } catch (e: any) {
    if (e.data?.code === "FORBIDDEN")
      ok("5. updateChat cross-chat correctly blocked");
    else fail("5. updateChat cross-chat", e);
  }

  // --- 4. Expense Writes & Reads ---
  let expenseId = "";
  try {
    const exp = await scoped.expense.createExpense.mutate({
      chatId: CHAT_A,
      creatorId: USER_1,
      payerId: USER_1,
      description: "Dinner",
      amount: 90,
      currency: "USD",
      splitMode: "EQUAL" as any, // Type cast to avoid needing the database package enum
      participantIds: [USER_1, USER_2, USER_3], // $30 each
      sendNotification: false,
    });
    expenseId = exp.id;
    ok("6. createExpense on allowed chat succeeds");
  } catch (e) {
    fail("6. createExpense", e);
  }

  try {
    const expenses = await scoped.expense.getExpenseByChat.query({
      chatId: CHAT_A,
    });
    if (expenses.some((e) => e.id === expenseId))
      ok("7. getExpenseByChat on allowed chat succeeds");
    else fail("7. getExpenseByChat", "Expense not found in results");
  } catch (e) {
    fail("7. getExpenseByChat", e);
  }

  try {
    await scoped.expense.getExpenseByChat.query({ chatId: CHAT_B });
    fail("8. getExpenseByChat cross-chat", "Should have thrown FORBIDDEN");
  } catch (e: any) {
    if (e.data?.code === "FORBIDDEN")
      ok("8. getExpenseByChat cross-chat correctly blocked");
    else fail("8. getExpenseByChat cross-chat", e);
  }

  // Note: getExpenseDetails takes an ID, not a chatId. Our scope middleware requires it to fetch the expense first to check its chatId.
  try {
    const exp = await scoped.expense.getExpenseDetails.query({ expenseId });
    if (exp.id === expenseId)
      ok("9. getExpenseDetails on allowed chat succeeds");
    else fail("9. getExpenseDetails", "Wrong expense returned");
  } catch (e) {
    fail("9. getExpenseDetails", e);
  }

  // --- 5. Expense Shares (Balances) ---
  try {
    const netShare = await scoped.expenseShare.getNetShare.query({
      chatId: CHAT_A,
      mainUserId: USER_1,
      targetUserId: USER_2,
      currency: "USD",
    });
    // User 1 paid $90, User 2 owes $30 -> netShare should be positive 30
    if (netShare === 30)
      ok("10. getNetShare calculates correct balance on allowed chat");
    else fail("10. getNetShare", `Wrong balance: expected 30, got ${netShare}`);
  } catch (e) {
    fail("10. getNetShare", e);
  }

  try {
    await scoped.expenseShare.getNetShare.query({
      chatId: CHAT_B,
      mainUserId: USER_1,
      targetUserId: USER_2,
      currency: "USD",
    });
    fail("11. getNetShare cross-chat", "Should have thrown FORBIDDEN");
  } catch (e: any) {
    if (e.data?.code === "FORBIDDEN")
      ok("11. getNetShare cross-chat correctly blocked");
    else fail("11. getNetShare cross-chat", e);
  }

  // --- 6. Settlements ---
  let settlementId = "";
  try {
    const s = await scoped.settlement.createSettlement.mutate({
      chatId: CHAT_A,
      senderId: USER_2,
      receiverId: USER_1,
      amount: 15, // User 2 pays back half of what they owe
      currency: "USD",
      description: "Partial payback",
      sendNotification: false,
    });
    settlementId = s.id;
    ok("12. createSettlement on allowed chat succeeds");
  } catch (e) {
    fail("12. createSettlement", e);
  }

  try {
    const netShareAfter = await scoped.expenseShare.getNetShare.query({
      chatId: CHAT_A,
      mainUserId: USER_1,
      targetUserId: USER_2,
      currency: "USD",
    });
    // Original debt $30 - $15 settlement = $15 remaining
    if (netShareAfter === 15)
      ok("13. getNetShare reflects settlement correctly");
    else
      fail(
        "13. getNetShare after settlement",
        `Expected 15, got ${netShareAfter}`
      );
  } catch (e) {
    fail("13. getNetShare after settlement", e);
  }

  try {
    await scoped.settlement.createSettlement.mutate({
      chatId: CHAT_B,
      senderId: USER_2,
      receiverId: USER_1,
      amount: 15,
      currency: "USD",
    });
    fail("14. createSettlement cross-chat", "Should have thrown FORBIDDEN");
  } catch (e: any) {
    if (e.data?.code === "FORBIDDEN")
      ok("14. createSettlement cross-chat correctly blocked");
    else fail("14. createSettlement cross-chat", e);
  }

  // --- 7. Snapshots ---
  let snapshotId = "";
  try {
    const snap = await scoped.snapshot.create.mutate({
      chatId: CHAT_A,
      creatorId: USER_1,
      title: "Trip to NY",
      expenseIds: [expenseId],
    });
    snapshotId = snap.id;
    ok("15. snapshot.create on allowed chat succeeds");
  } catch (e) {
    fail("15. snapshot.create", e);
  }

  try {
    await scoped.snapshot.create.mutate({
      chatId: CHAT_B,
      creatorId: USER_1,
      title: "Hacked Trip",
      expenseIds: ["00000000-0000-0000-0000-000000000000"], // Need a valid uuid to pass zod
    });
    fail("16. snapshot.create cross-chat", "Should have thrown FORBIDDEN");
  } catch (e: any) {
    if (e.data?.code === "FORBIDDEN")
      ok("16. snapshot.create cross-chat correctly blocked");
    else fail("16. snapshot.create cross-chat", e);
  }

  // --- 8. Admin endpoints blocked ---
  try {
    await scoped.chat.getAllChats.query({});
    fail("17. chat.getAllChats", "Should have thrown FORBIDDEN");
  } catch (e: any) {
    if (e.data?.code === "FORBIDDEN")
      ok("17. chat.getAllChats correctly blocked (assertNotChatScoped)");
    else fail("17. chat.getAllChats", e);
  }

  try {
    await scoped.user.createUser.mutate({
      userId: 999,
      firstName: "Hacker",
      lastName: "Bad",
      userName: "hack",
    });
    fail("18. user.createUser", "Should have thrown FORBIDDEN");
  } catch (e: any) {
    if (e.data?.code === "FORBIDDEN")
      ok("18. user.createUser correctly blocked (assertNotChatScoped)");
    else fail("18. user.createUser", e);
  }
}

async function main() {
  try {
    const scopedClient = await setupTestData();
    await runComprehensiveTests(scopedClient);

    console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
    process.exit(failed > 0 ? 1 : 0);
  } catch (e) {
    console.error("Fatal error:", e);
    process.exit(1);
  }
}

main();
