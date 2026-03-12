# Personal Expenses Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable personal (non-group) expense tracking by creating a private Chat record for each user at user creation time, and backfilling existing users.

**Architecture:** Modify `createUserHandler` to also create a `Chat` with `type: "private"` and `id = userId` after user creation. Write a standalone backfill script for existing users. No schema changes, no new tRPC procedures, no frontend changes.

**Tech Stack:** Prisma, tRPC, TypeScript, vitest (for testing)

---

### Task 1: Modify `createUserHandler` to create personal chat

**Files:**

- Modify: `packages/trpc/src/routers/user/createUser.ts:25-71`

**Step 1: Add personal chat creation to `createUserHandler`**

In `packages/trpc/src/routers/user/createUser.ts`, modify the `createUserHandler` function to create a personal `Chat` after the user is created. Replace the existing handler with:

```typescript
export const createUserHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
) => {
  try {
    // Check if user already exists
    const existingUser = await db.user.findUnique({
      where: { id: input.userId },
    });
    if (existingUser) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `User with ID ${input.userId} already exists`,
      });
    }

    const user = await db.user.create({
      data: {
        id: input.userId,
        firstName: input.firstName,
        lastName: input.lastName,
        username: input.userName,
        phoneNumber: input.phoneNumber,
      },
    });

    // Create personal chat for the user (private chat ID = user ID in Telegram)
    try {
      await db.chat.create({
        data: {
          id: input.userId,
          title: input.firstName,
          type: "private",
          members: {
            connect: { id: input.userId },
          },
        },
      });
    } catch (chatError) {
      // If the personal chat already exists (e.g., race condition), log and continue.
      // The user was already created successfully -- don't fail the whole operation.
      if (
        chatError instanceof Error &&
        chatError.message.includes("Unique constraint failed")
      ) {
        console.warn(
          `Personal chat for user ${input.userId} already exists, skipping creation.`
        );
      } else {
        console.error(
          `Failed to create personal chat for user ${input.userId}:`,
          chatError
        );
      }
    }

    return user;
  } catch (error) {
    if (error instanceof TRPCError) {
      throw error;
    }

    // Handle Prisma unique constraint violations
    if (
      error instanceof Error &&
      error.message.includes("Unique constraint failed")
    ) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `User with ID ${input.userId} already exists`,
      });
    }

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to create user",
    });
  }
};
```

**Step 2: Verify types compile**

Run: `turbo check-types --filter=@dko/trpc`

Expected: No type errors.

**Step 3: Commit**

```bash
git add packages/trpc/src/routers/user/createUser.ts
git commit -m "feat: create personal chat on user creation"
```

---

### Task 2: Create backfill script for existing users

**Files:**

- Create: `packages/database/scripts/backfill-personal-chats.ts`

**Step 1: Create the scripts directory and backfill script**

Create `packages/database/scripts/backfill-personal-chats.ts`:

```typescript
import { PrismaClient } from "../generated/client/index.js";

async function backfillPersonalChats() {
  const db = new PrismaClient();

  try {
    console.log("Starting backfill of personal chats...");

    const users = await db.user.findMany({
      select: { id: true, firstName: true },
    });

    console.log(`Found ${users.length} users to process.`);

    let created = 0;
    let skipped = 0;
    let failed = 0;

    for (const user of users) {
      try {
        // Check if personal chat already exists
        const existingChat = await db.chat.findUnique({
          where: { id: user.id },
        });

        if (existingChat) {
          // Chat with this ID already exists
          if (existingChat.type === "private") {
            skipped++;
            continue;
          }
          // If a non-private chat has the same ID as a user, that's unexpected.
          // Log it and skip.
          console.warn(
            `Chat ${user.id} exists but is type "${existingChat.type}", not "private". Skipping.`
          );
          skipped++;
          continue;
        }

        await db.chat.create({
          data: {
            id: user.id,
            title: user.firstName,
            type: "private",
            members: {
              connect: { id: user.id },
            },
          },
        });

        created++;
        console.log(
          `Created personal chat for user ${user.id} (${user.firstName})`
        );
      } catch (error) {
        failed++;
        console.error(
          `Failed to create personal chat for user ${user.id}:`,
          error
        );
      }
    }

    console.log(`\nBackfill complete:`);
    console.log(`  Created: ${created}`);
    console.log(`  Skipped: ${skipped}`);
    console.log(`  Failed: ${failed}`);
  } finally {
    await db.$disconnect();
  }
}

backfillPersonalChats().catch((error) => {
  console.error("Backfill script failed:", error);
  process.exit(1);
});
```

**Step 2: Add a script command to `packages/database/package.json`**

Add to the `"scripts"` section:

```json
"backfill:personal-chats": "npx tsx scripts/backfill-personal-chats.ts"
```

**Step 3: Verify the script compiles**

Run: `npx tsx --check packages/database/scripts/backfill-personal-chats.ts` (from monorepo root)

Or simply run `turbo check-types --filter=@dko/database` to verify no type errors.

**Step 4: Commit**

```bash
git add packages/database/scripts/backfill-personal-chats.ts packages/database/package.json
git commit -m "feat: add backfill script for personal chats"
```

---

### Task 3: Run backfill against production database

**This task is manual and should be done by the developer.**

**Step 1: Run the backfill script**

From the `packages/database` directory, with the production `DATABASE_URL` configured:

```bash
pnpm backfill:personal-chats
```

**Step 2: Verify the output**

Check the console output for:

- Number of users processed
- Number of personal chats created
- No failures

**Step 3: Spot-check in the database**

Verify a few users now have corresponding `Chat` records with `type = "private"` and their user ID as the chat ID.

---

### Task 4: End-to-end verification

**This task verifies the full flow works as expected.**

**Step 1: Test user creation creates personal chat**

Using the existing app flow (or directly via tRPC), create a new test user and verify:

- A `User` record is created
- A `Chat` record with `id = userId`, `type = "private"` is also created
- The user is a member of the personal chat

**Step 2: Test creating a personal expense**

Call the existing `createExpense` tRPC procedure with:

```typescript
{
  chatId: userId,        // personal chat ID = user ID
  creatorId: userId,
  payerId: userId,
  description: "Test personal expense",
  amount: 10.00,
  splitMode: "EQUAL",
  participantIds: [userId],
  sendNotification: false,
  currency: "SGD",
}
```

Verify the expense is created successfully.

**Step 3: Test querying personal expenses**

Call `getAllExpensesByChat({ chatId: userId })` and verify the personal expense appears.

**Step 4: Test deleting a personal expense**

Call `deleteExpense({ expenseId, chatId: userId })` and verify it's deleted.
