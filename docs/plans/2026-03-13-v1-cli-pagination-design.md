# V1 CLI Pagination & Filtering Design

## Overview

As part of the v1 release of the Banana Split TMA Agent-first CLI (`@banananasplitz/cli`), we need to introduce pagination and filtering capabilities to all listing commands (`list-expenses`, `list-snapshots`, `list-chats`). This is critical to prevent AI agents from pulling down thousands of records and blowing up their context window.

## Backend Changes (tRPC Routers)

The current tRPC backend simply queries the database for all records associated with a chat. We need to introduce optional query filters.

### Schema Updates

For the `expense`, `snapshot`, and `chat` routers (specifically `getAllExpensesByChat`, `getSnapshots`, and `getChats` / `listChats` handlers), we will extend the Zod `inputSchema` to include:

```typescript
const inputSchema = z.object({
  chatId: z.number(), // (already exists for expense/snapshot)
  limit: z.number().min(1).max(100).optional(),
  offset: z.number().min(0).optional(),
  startDate: z.string().datetime().optional(), // For expenses/snapshots
  endDate: z.string().datetime().optional(), // For expenses/snapshots
  currency: z.string().length(3).optional(), // For expenses
});
```

### Safety & Backward Compatibility

By making these parameters `optional()`, the existing React frontend—which heavily relies on `useVirtualizer` to render all items seamlessly—will continue to function identically (since it won't send the new parameters initially).

### Implementation Details

We will update the Prisma `findMany` queries within the handlers:

- **`take`**: Map to `input.limit`. If `input.limit` is provided, limit the number of records returned.
- **`skip`**: Map to `input.offset`.
- **`where`**: Append `date` or `createdAt` (`gte` / `lte`) logic for `startDate` and `endDate`.
- **`where.currency`**: Ensure this is hooked up for expenses.

## CLI Changes (`@banananasplitz/cli`)

The CLI will wrap these new capabilities by adding command options via `parseArgs`.

### `list-expenses`

- **Options**: `--limit` (default: 50), `--offset`, `--start-date` (YYYY-MM-DD), `--end-date` (YYYY-MM-DD), `--currency` (currently exists but ignored by the backend).
- **Behavior**: Will map CLI flags into the tRPC query. Converts dates to ISO strings before sending them over the wire.

### `list-snapshots`

- **Options**: `--limit` (default: 50), `--offset`, `--start-date`, `--end-date`.

### `list-chats`

- **Options**: `--limit` (default: 50), `--offset`.

## Error Handling

- Date formats will be validated locally in the CLI before making the request. If invalid, the CLI throws a helpful standard Agent `error()` output.
- `limit` sizes will be clamped by the backend schema (e.g., maximum 100 per page to enforce performance constraints).
