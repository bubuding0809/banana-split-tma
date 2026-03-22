# Expense Categories Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to categorize expenses using global presets and chat-specific custom categories, storing the category snapshot on the expense itself.

**Architecture:** 
1. Prisma schema updates: Add `Category` model, update `Expense` model, and add seed data for global presets (`chatId: null`).
2. tRPC backend: Add `category` router for fetching and creating categories. Update `expense` router to accept snapshot data.
3. Frontend: Update the Add/Edit Expense forms to include a Category Picker sheet that supports search, selection, and inline creation of custom categories (with emoji picker).

**Tech Stack:** TypeScript, Prisma, tRPC, React, Tailwind CSS, `@telegram-apps/telegram-ui`

---

## Chunk 1: Database & Backend Foundation

### Task 1: Update Prisma Schema

**Files:**
- Modify: `packages/database/prisma/schema.prisma`

- [ ] **Step 1: Add Category model and update Expense**
Add the `Category` model and update `Expense` with snapshot fields in `schema.prisma`.

```prisma
// Add near the top or after Chat
model Category {
  id        String   @id @default(uuid())
  chat      Chat?    @relation(fields: [chatId], references: [id], onDelete: Cascade)
  chatId    BigInt?  // null means it's a global preset category
  name      String
  icon      String   // Emoji character
  createdAt DateTime @default(now())
  
  @@unique([chatId, name])
  @@index([chatId])
}

// Update Expense model
model Expense {
  // ... existing fields ...
  amount             Decimal           @db.Decimal(12, 2)
  currency           String            @default("SGD")
  splitMode          SplitMode
  categoryName       String?           // Snapshot of the category name
  categoryIcon       String?           // Snapshot of the category emoji
  // ... existing fields ...
}
```

- [ ] **Step 2: Generate Prisma Client**
Run: `pnpm turbo db:generate`
Expected: Success message indicating client generated.

- [ ] **Step 3: Create Migration**
Run: `pnpm --filter database prisma migrate dev --name add_expense_categories`
Expected: Migration created and applied to local DB.

- [ ] **Step 4: Commit**
```bash
git add packages/database/prisma/
git commit -m "feat(db): add Category model and Expense snapshot fields"
```

### Task 2: Seed Global Categories

**Files:**
- Modify/Create: `packages/database/prisma/seed.ts` (or equivalent seed script if exists)

- [ ] **Step 1: Write seed logic for global categories**
Ensure global categories exist with `chatId: null`.

```typescript
// Inside seed.ts main function or a new seedCategories script
const DEFAULT_CATEGORIES = [
  { name: 'Outside food', icon: '🍔' },
  { name: 'Groceries', icon: '🥬' },
  { name: 'Household', icon: '🪜' },
  { name: 'Work Lunch', icon: '🏗️' },
  { name: 'Shopping', icon: '🛍️' },
  { name: 'Transport', icon: '🚕' },
  { name: 'Entertainment', icon: '🤑' },
  { name: 'Travel', icon: '✈️' },
];

for (const cat of DEFAULT_CATEGORIES) {
  await prisma.category.upsert({
    where: {
      chatId_name: {
        chatId: 0, // Prisma doesn't allow null in compound unique constraints easily in some versions, check schema. If needed, we might use a special dummy ID or just use findFirst.
        // ACTUALLY: Prisma supports null in unique constraints now, but upsert with null is tricky.
        // Let's use standard findFirst + create.
      }
    }
  });
  
  // Safer approach for nulls:
  const existing = await prisma.category.findFirst({
    where: { chatId: null, name: cat.name }
  });
  if (!existing) {
    await prisma.category.create({
      data: { name: cat.name, icon: cat.icon }
    });
  }
}
```
*(Self-correction: If there's no seed script, we'll create a simple one or add a startup check in the tRPC context initialization, but a Prisma seed is best).*

- [ ] **Step 2: Run Seed**
Run: `pnpm --filter database prisma db seed` (if configured) or run the script directly.
Expected: Global categories populated in DB.

- [ ] **Step 3: Commit**
```bash
git add packages/database/
git commit -m "chore(db): add seed logic for global categories"
```

### Task 3: Create Category tRPC Router

**Files:**
- Create: `packages/trpc/src/routers/category/index.ts`
- Create: `packages/trpc/src/routers/category/listForChat.ts`
- Create: `packages/trpc/src/routers/category/createCustom.ts`
- Create: `packages/trpc/src/routers/category/updateCustom.ts`
- Create: `packages/trpc/src/routers/category/deleteCustom.ts`
- Modify: `packages/trpc/src/root.ts`

- [ ] **Step 1: Implement listForChat procedure**
```typescript
import { publicProcedure } from '../../trpc';
import { z } from 'zod';

export const listForChat = publicProcedure
  .input(z.object({ chatId: z.bigint() }))
  .query(async ({ input, ctx }) => {
    // Fetch global (null) and chat-specific categories
    return ctx.db.category.findMany({
      where: {
        OR: [
          { chatId: null },
          { chatId: input.chatId }
        ]
      },
      orderBy: [
        { chatId: 'asc' }, // Globals first (nulls sort first usually, or use separate queries if needed)
        { name: 'asc' }
      ]
    });
  });
```

- [ ] **Step 2: Implement createCustom procedure**
```typescript
import { publicProcedure } from '../../trpc';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';

export const createCustom = publicProcedure
  .input(z.object({ 
    chatId: z.bigint(),
    name: z.string().min(1).max(50),
    icon: z.string().min(1).max(10) // emoji
  }))
  .mutation(async ({ input, ctx }) => {
    // Check if name exists globally or in this chat
    const existing = await ctx.db.category.findFirst({
      where: {
        name: { equals: input.name, mode: 'insensitive' },
        OR: [{ chatId: null }, { chatId: input.chatId }]
      }
    });

    if (existing) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'A category with this name already exists here.'
      });
    }

    return ctx.db.category.create({
      data: {
        chatId: input.chatId,
        name: input.name,
        icon: input.icon
      }
    });
  });
```

- [ ] **Step 3: Implement updateCustom & deleteCustom procedures**
Add endpoints to update and delete a category. Ensure `chatId: null` categories (globals) are protected and cannot be mutated by user requests.

- [ ] **Step 4: Wire up the router**
Combine them in `category/index.ts` and add to the main `appRouter`.

- [ ] **Step 5: Commit**
```bash
git add packages/trpc/src/routers/
git commit -m "feat(api): add category router for listing and creating"
```

### Task 4: Update Expense tRPC Router

**Files:**
- Modify: `packages/trpc/src/routers/expense/createExpense.ts`
- Modify: `packages/trpc/src/routers/expense/updateExpense.ts`

- [ ] **Step 1: Update createExpense schema and logic**
Add `categoryName: z.string().nullable().optional()` and `categoryIcon: z.string().nullable().optional()` to input schema. Pass them to `ctx.db.expense.create`.

- [ ] **Step 2: Update updateExpense schema and logic**
Add the same optional fields to `updateExpense` input schema and pass to `ctx.db.expense.update`.

- [ ] **Step 3: Commit**
```bash
git add packages/trpc/src/routers/expense/
git commit -m "feat(api): support category snapshot fields in expense router"
```

---

## Chunk 2: Frontend Integration

### Task 5: Form Types & Schema Update

**Files:**
- Modify: `apps/web/src/components/features/Expense/AddExpenseForm.type.ts`
- Modify: `apps/web/src/components/features/Expense/AddExpenseForm.tsx`

- [ ] **Step 1: Update form schema**
Add category fields to the Zod schema used by `@tanstack/react-form`.
```typescript
categoryName: z.string().nullable().optional(),
categoryIcon: z.string().nullable().optional(),
```

- [ ] **Step 2: Update form component**
Initialize `defaultValues` with category fields (null by default).

- [ ] **Step 3: Commit**
```bash
git add apps/web/src/components/features/Expense/
git commit -m "feat(web): add category fields to expense form schema"
```

### Task 6: Category Picker Component

**Files:**
- Create: `apps/web/src/components/features/Expense/CategoryPicker.tsx`
- Create: `apps/web/src/components/features/Expense/EmojiPicker.tsx` (or integrate a lightweight library like `emoji-picker-react` if allowed, otherwise build a simple native OS picker trigger).

- [ ] **Step 1: Build the UI Shell**
Create a button that says "Select Category" (or shows the selected category). When clicked, it opens a Telegram UI `Modal` or full-screen overlay.

- [ ] **Step 2: Implement Search and List**
Use `trpc.category.listForChat.useQuery`. Render the list. Add a search input. Filter the list locally based on search.

- [ ] **Step 3: Implement Creation Flow**
If the filtered list is empty based on the search term, show the `Create "[Term]" +` button.
When clicked, prompt the user for an emoji (a simple native `<input type="text" />` that requests the emoji keyboard works best on mobile).

- [ ] **Step 4: Wire up creation mutation**
Use `trpc.category.createCustom.useMutation`. On success, invalidate the `listForChat` query and auto-select the new category.

- [ ] **Step 5: Commit**
```bash
git add apps/web/src/components/features/Expense/
git commit -m "feat(web): build category picker with inline creation"
```

### Task 7: Integrate Picker into Expense Forms

**Files:**
- Modify: `apps/web/src/components/features/Expense/AmountFormStep.tsx` (or wherever it fits best visually, perhaps a new `CategoryFormStep.tsx` or alongside the Description field).

- [ ] **Step 1: Mount the Picker**
Mount `<CategoryPicker />` and connect it to the `@tanstack/react-form` using `form.Field`.

```typescript
<form.Field name="categoryName">
  {(field) => (
    // Pass field.value and field.handleChange to the picker
  )}
</form.Field>
// (Do same for categoryIcon or handle them together)
```

- [ ] **Step 2: Commit**
```bash
git add apps/web/src/components/features/Expense/
git commit -m "feat(web): integrate category picker into expense form"
```

### Task 8: Display Categories on Expense Lists

**Files:**
- Modify: `apps/web/src/components/features/Chat/ExpenseListItem.tsx` (or equivalent)
- Modify: `apps/web/src/components/features/Expense/ExpenseDetailsModal.tsx` (if it exists)

- [ ] **Step 1: Render the Icon/Name**
If `expense.categoryIcon` and `categoryName` exist, render them next to the description or amount in the list view.
Fallback gracefully if they are null.

- [ ] **Step 2: Commit**
```bash
git add apps/web/src/components/features/
git commit -m "feat(web): display category icons on expense list items"
```

### Task 9: Chat Settings - Manage Categories

**Files:**
- Modify: `apps/web/src/components/features/Settings/ChatSettingsPage.tsx` (or equivalent file)
- Create: `apps/web/src/routes/_tma/chat/$chatId_/categories.tsx`
- Create: `apps/web/src/components/features/Settings/ManageCategoriesPage.tsx`

- [ ] **Step 1: Add Link/Button to Chat Settings**
In the main chat settings, add a Telegram UI `Cell` component with `navigation` (right arrow icon) that links to `/_tma/chat/$chatId/categories`.

- [ ] **Step 2: Build ManageCategoriesPage**
Create a dedicated route and page component. Use `trpc.category.listForChat.useQuery`.
- Separate globals from custom categories.
- Use Telegram UI components like `Section` and `Cell` to display the lists.
- For custom categories, add Edit and Delete actions.

- [ ] **Step 3: Wire up update and delete mutations**
- Hook Delete button to `trpc.category.deleteCustom.useMutation`. Show confirmation.
- Hook Edit and Create to an inline form or sub-modal within this page using `trpc.category.createCustom` and `trpc.category.updateCustom`.

- [ ] **Step 4: Commit**
```bash
git add apps/web/src/components/features/Settings/
git commit -m "feat(web): add chat settings page to manage categories"
```