/**
 * End-to-end test for chat-scoped API keys.
 *
 * Tests:
 * 1. Superadmin getScope -> unscoped
 * 2. Seed chat + user, generate scoped API key
 * 3. Scoped key getScope -> scoped with chatId
 * 4. Scoped key can access its own chat
 * 5. Scoped key is blocked from wrong chat
 * 6. Scoped key is blocked from getAllChats
 * 7. Revoke scoped key
 * 8. Revoked key is rejected
 */

import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";

// Import the AppRouter type
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

async function main() {
  console.log("\n=== Chat-Scoped API Keys E2E Tests ===\n");

  // Test 1: Superadmin getScope -> unscoped
  console.log("Test 1: Superadmin getScope");
  try {
    const scope = await superadmin.apiKey.getScope.query();
    if (scope.scoped === false) {
      ok("Superadmin getScope returns { scoped: false }");
    } else {
      fail(
        "Superadmin getScope",
        `Expected scoped=false, got scoped=${scope.scoped}`
      );
    }
  } catch (e) {
    fail("Superadmin getScope", e);
  }

  // Test 2: Seed a chat + user, then generate a scoped key
  console.log("\nTest 2: Seed data + generate scoped key");

  // Create a user first
  try {
    await superadmin.user.createUser.mutate({
      userId: 111111,
      firstName: "Test",
      lastName: "User",
      userName: "testuser",
    });
    ok("Created test user 111111");
  } catch (e: any) {
    // User might already exist from a previous run
    if (e.message?.includes("already exists")) {
      ok("Test user 111111 already exists (OK)");
    } else {
      fail("Create user", e);
    }
  }

  // Create a chat
  try {
    await superadmin.chat.createChat.mutate({
      chatId: 999999,
      chatTitle: "Test Chat for Scoped Keys",
      chatType: "group",
    });
    ok("Created test chat 999999");
  } catch (e: any) {
    if (e.message?.includes("already exists")) {
      ok("Test chat 999999 already exists (OK)");
    } else {
      fail("Create chat", e);
    }
  }

  // Create a second chat (for cross-chat test)
  try {
    await superadmin.chat.createChat.mutate({
      chatId: 888888,
      chatTitle: "Other Chat (should be blocked)",
      chatType: "group",
    });
    ok("Created test chat 888888");
  } catch (e: any) {
    if (e.message?.includes("already exists")) {
      ok("Test chat 888888 already exists (OK)");
    } else {
      fail("Create chat 888888", e);
    }
  }

  // Generate a scoped API key for chat 999999
  let scopedKey = "";
  try {
    const result = await superadmin.apiKey.generate.mutate({
      chatId: 999999,
      createdById: 111111,
    });
    scopedKey = result.rawKey;
    ok(`Generated scoped key: ${result.keyPrefix}... for chat 999999`);
  } catch (e) {
    fail("Generate scoped key", e);
  }

  if (!scopedKey) {
    console.error("\nCannot continue — no scoped key generated.");
    process.exit(1);
  }

  const scoped = makeClient(scopedKey);

  // Test 3: Scoped key getScope -> scoped
  console.log("\nTest 3: Scoped key getScope");
  try {
    const scope = await scoped.apiKey.getScope.query();
    if (scope.scoped === true && scope.chatId === 999999) {
      ok(
        `Scoped getScope returns { scoped: true, chatId: 999999, chatTitle: "${scope.chatTitle}" }`
      );
    } else {
      fail("Scoped getScope", `Unexpected result: ${JSON.stringify(scope)}`);
    }
  } catch (e) {
    fail("Scoped getScope", e);
  }

  // Test 4: Scoped key can access its own chat
  console.log("\nTest 4: Scoped key accesses own chat");
  try {
    const chat = await scoped.chat.getChat.query({ chatId: 999999 });
    if (chat.title === "Test Chat for Scoped Keys") {
      ok("Scoped key can getChat for chat 999999");
    } else {
      fail("Scoped key getChat", `Unexpected title: ${chat.title}`);
    }
  } catch (e) {
    fail("Scoped key getChat 999999", e);
  }

  // Test 5: Scoped key is blocked from accessing wrong chat
  console.log("\nTest 5: Scoped key blocked from wrong chat");
  try {
    await scoped.chat.getChat.query({ chatId: 888888 });
    fail("Cross-chat access", "Expected FORBIDDEN error but call succeeded!");
  } catch (e: any) {
    if (
      e.message?.includes("does not have access") ||
      e.data?.code === "FORBIDDEN"
    ) {
      ok("Scoped key correctly blocked from chat 888888 (FORBIDDEN)");
    } else {
      fail("Cross-chat access error type", e.message);
    }
  }

  // Test 6: Scoped key is blocked from getAllChats
  console.log("\nTest 6: Scoped key blocked from getAllChats");
  try {
    await scoped.chat.getAllChats.query({});
    fail("getAllChats", "Expected FORBIDDEN error but call succeeded!");
  } catch (e: any) {
    if (
      e.message?.includes("not available with a chat-scoped") ||
      e.data?.code === "FORBIDDEN"
    ) {
      ok("Scoped key correctly blocked from getAllChats (FORBIDDEN)");
    } else {
      fail("getAllChats error type", e.message);
    }
  }

  // Test 7: Revoke the scoped key
  console.log("\nTest 7: Revoke scoped key");
  try {
    const result = await superadmin.apiKey.revoke.mutate({ chatId: 999999 });
    if (result.revoked === true) {
      ok(`Revoked key ${result.keyPrefix}... for chat 999999`);
    } else {
      fail("Revoke key", `Unexpected result: ${JSON.stringify(result)}`);
    }
  } catch (e) {
    fail("Revoke key", e);
  }

  // Test 8: Revoked key is rejected
  console.log("\nTest 8: Revoked key is rejected");
  try {
    await scoped.apiKey.getScope.query();
    fail(
      "Revoked key access",
      "Expected UNAUTHORIZED error but call succeeded!"
    );
  } catch (e: any) {
    if (
      e.message?.includes("Invalid API key") ||
      e.data?.code === "UNAUTHORIZED"
    ) {
      ok("Revoked key correctly rejected (UNAUTHORIZED)");
    } else {
      fail("Revoked key error type", e.message);
    }
  }

  // Summary
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
