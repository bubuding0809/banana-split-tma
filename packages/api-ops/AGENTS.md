# `@bananasplitz/api-ops` — Agent Instructions

Shared tRPC orchestration layer used by `@banananasplitz/cli` and the Raycast extension. Each exported op maps 1:1 to a CLI command name in camelCase (e.g. `list-chats` → `listChats`).

## Adding a new command

1. Implement the op in the appropriate `src/ops/<domain>.ts` file.
2. Export it from `src/index.ts` (camelCase name matching CLI kebab-case).
3. Add validation via `ApiValidationError` (`missing_field` / `invalid_field`) when the CLI previously used `error("missing_option" | "invalid_option", ...)`.
4. Wire thin adapters in `apps/cli/src/commands/` and `apps/raycast/src/tools/`.
5. Add a unit test in `src/ops/<domain>.test.ts`.
6. Run `pnpm check-coverage` to verify the CLI ↔ op export map.

## Design rules

- Ops accept `(trpc: TrpcClient, input)` and return the tRPC result.
- Use `resolveChatId` from `@bananasplitz/api-client` for chat-scoped commands.
- File I/O (bulk import/update JSON files) stays in CLI adapters; ops accept parsed rows.
- `settle-all-with` preview logic stays in the CLI adapter; the op is `settleAllWith(trpc, { counterpartyUserId })`.

## Verification

```bash
pnpm --filter @bananasplitz/api-ops test
pnpm --filter @bananasplitz/api-ops check-coverage
pnpm --filter @bananasplitz/api-ops check-types
```
