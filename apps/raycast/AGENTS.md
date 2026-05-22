# Raycast — agent notes

## Raycast AI tools ↔ CLI parity

Every command registered in `apps/cli/src/commands/*.ts` (except meta: `help`, `login`, `install-skill`) must have a matching entry in `apps/raycast/package.json` → `tools[]`, implemented as `apps/raycast/src/tools/<name>.ts`.

**Invariant:** CLI command `name` === Raycast tool `name` === file `src/tools/<name>.ts`.

### Check locally

```bash
cd apps/raycast && pnpm check-parity
```

### When adding a CLI command

1. Add the CLI command in `apps/cli/src/commands/`.
2. Register metadata in `package.json` `tools[]`.
3. Add `src/tools/<name>.ts` using `runTool()` from `src/lib/tools/run-tool.ts`.
4. Run `pnpm check-parity`, `pnpm check-types`, `pnpm lint`, `pnpm build`.

Mutating tools must export `confirmation` from `@raycast/api`.
