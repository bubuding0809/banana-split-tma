# Feature Specification: Expense Categories

## 1. Overview
Users need the ability to categorize expenses to better track and understand their spending within a Chat. The system will provide a built-in list of preset categories and allow users to create custom categories specific to their Chat.

## 2. Product Requirements
- **Visual Representation**: Categories are represented by an emoji (icon) and a text name (e.g., "🍔 Food & Dining").
- **Scope**: Custom categories are scoped to the Chat level. If created in Chat A, they are available to all members of Chat A, but not in Chat B.
- **Creation Flow**: "Search Bar Creation" - When adding an expense, the user searches for a category. If no match is found, a button appears to create the new category, prompting them to select an emoji.
- **Historical Integrity**: Changing or deleting a category (preset or custom) must NOT alter the category displayed on past expenses.

## 3. Architecture & Data Model

We will use a **Snapshot Architecture** to ensure historical integrity without complex database relationships or soft-deletes.

### 3.1 Database Schema (Prisma)

**New Model:**
```prisma
model Category {
  id        String   @id @default(uuid())
  chat      Chat?    @relation(fields: [chatId], references: [id], onDelete: Cascade)
  chatId    BigInt?  // null means it's a global preset category
  name      String
  icon      String   // Emoji character
  createdAt DateTime @default(now())
  
  @@unique([chatId, name]) // Prevent duplicate names within a chat (and globally for null)
  @@index([chatId])
}
```

**Modified Model (`Expense`):**
```prisma
model Expense {
  // ... existing fields ...
  categoryName String?  // Snapshot of the category name at creation
  categoryIcon String?  // Snapshot of the category emoji at creation
  // ...
}
```

*Note: By storing `categoryName` and `categoryIcon` directly on the `Expense`, we avoid a strict foreign key dependency. If a global `Category` is modified or deleted, past expenses retain their visual category.*

### 3.2 Global Presets
Global presets will be stored in the database as rows in the `Category` table with `chatId` set to `null`.
These can be seeded using a database seeding script or a startup migration to ensure they are always present.

## 4. API (tRPC)

### 4.1 New Router: `category`
- `category.listForChat`: Fetches all global and custom categories for a specific `chatId`.
- `category.create`: Creates a new custom category for a `chatId` (validates uniqueness against both DB and global presets).
- `category.update`: Updates the name/icon of a custom category. (Cannot update global presets).
- `category.delete`: Deletes a custom category (does not affect past expenses due to snapshot architecture. Cannot delete global presets).

### 4.2 Modified Procedures
- `expense.createExpense`: Update input schema to accept `categoryName` and `categoryIcon`.
- `expense.updateExpense`: Update input schema to allow modifying `categoryName` and `categoryIcon`.

## 5. Frontend UI/UX

### 5.1 Category Picker Sheet
- **Search Bar**: Filters both global presets and custom categories.
- **Empty State (Not Found)**: Displays a button: "Create '[Search Term]' ➕".
- **Emoji Picker**: Tapping the create button opens an emoji picker (e.g., using `@emoji-mart/react` or a native Telegram UI equivalent if available) to finalize creation.
- **Creation Mutation**: The creation is optimistic or blocks briefly to save the new category via tRPC before selecting it for the expense form.

### 5.3 Chat Settings - Manage Categories
- Add a new "Manage Categories" section within the Chat Settings page.
- Lists all available categories for the chat.
- Custom categories will show an "Edit" and "Delete" option (or swipe-to-delete).
- Global preset categories will be displayed as read-only (or visual indicator that they are locked/system presets).

## 6. Migration Plan
1. **Schema Update**: Deploy the Prisma schema changes (`Category` model and `Expense` fields).
2. **Backward Compatibility**: Existing expenses will have `null` for category fields. The UI must gracefully handle expenses without categories (e.g., show a generic fallback icon like "🏷️" or nothing).
3. **Rollout**: Deploy backend tRPC changes, then frontend UI updates.