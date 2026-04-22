# Changelog

All notable changes to `@banananasplitz/cli` are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.10.0] - 2026-04-22

### Changed

- `update-expense` now supports **partial updates** — only `--expense-id` is required. Any omitted field (`--payer-id`, `--description`, `--amount`, `--split-mode`, `--participant-ids`, `--currency`, `--date`, `--category`) falls back to the expense's current value fetched via `get-expense`. This prevents accidental data loss when updating a single field (e.g. category) on an expense with a non-EQUAL split.

## [0.9.0] - 2026-04-22

### Added

- `list-categories` command — pass-through wrapper around `category.listByChat`; returns base + custom categories with `id`, `emoji`, `title`, `kind`, `hidden`, and `sortOrder`.
- `--category <id>` flag on `create-expense` — tags the new expense with a category (`base:<slug>` or `chat:<uuid>`). Omit for uncategorized.
- `--category <id>` flag on `update-expense` — tri-state: omit leaves the category unchanged, `--category none` clears it, any other value sets it (server validates the id prefix).

## [0.8.1] - 2026-04-20

### Fixed

- Release pipeline: the 0.8.0 tarball shipped with `@repo/categories: "workspace:*"` in `dependencies`, which npm rejects with `Unsupported URL Type "workspace:"`. Moved all workspace packages into `devDependencies` (tsup's `noExternal: [/.*/]` already inlines them into `dist/cli.js`, so consumers don't need them installed). Also switched CI to `pnpm publish` as defense in depth — it rewrites `workspace:*` to pinned versions at pack time, so any future workspace dep accidentally listed as a runtime dep won't leak the protocol string into the registry.

## [0.8.0] - 2026-04-20

### Added

- Expense category display: each expense row shows the category emoji + title when present (via the new `categoryLabel` field in `list-expenses` output).
- `--category <id>` filter on `list-expenses`. Accepts `base:<slug>` for base categories and `chat:<uuid>` for custom per-chat categories. Expenses with no category (including settlement-style rows) are never filtered out.

## [0.7.4] - 2026-04-20

### Changed

- Internal: tightened `createTrpcClient` return type annotation to the explicit `TRPCClient<AppRouter>` to unblock downstream packages consuming new tRPC procedures in the broadcast history feature (no runtime behavior change).

## [0.7.3] - 2026-04-20

### Changed

- CI: `publish-cli` now runs on Node 24 (which ships with npm 11+). Removed the explicit `npm install -g npm@latest` workaround introduced in 0.7.2.

## [0.7.2] - 2026-04-20

### Fixed

- Release pipeline: upgrade npm to 11+ before `npm publish` so OIDC-based Trusted Publishing authenticates against the registry correctly. 0.7.1 was a failed publish (sigstore provenance signed but registry rejected the empty auth header).

## [0.7.0] - 2026-04-20

### Added

- `list-my-balances` — outstanding balances across every chat the caller is a member of, with per-currency net and counterparty breakdown. Requires a user-level API key.
- `list-my-spending --month YYYY-MM` — caller's share of expenses per chat for a given UTC month, with per-currency totals. Requires a user-level API key.

### Changed

- Refactor: extracted pairwise-net math from `getBulkChatDebts` into a shared `chatBalances` helper in `@dko/trpc`. Behavior identical; enables reuse by the new cross-chat procedures.

## [0.6.0] - 2026-03-16

### Notes

- Version was live on npm with prior CLI contents before the 0.7.0 cross-chat work landed. No changelog was maintained at the time; this entry is retroactive for continuity.

[Unreleased]: https://github.com/bubuding0809/banana-split-tma/compare/v0.8.0...HEAD
[0.8.0]: https://github.com/bubuding0809/banana-split-tma/releases/tag/v0.8.0
[0.7.3]: https://github.com/bubuding0809/banana-split-tma/releases/tag/v0.7.3
[0.7.2]: https://github.com/bubuding0809/banana-split-tma/releases/tag/v0.7.2
[0.7.0]: https://github.com/bubuding0809/banana-split-tma/releases/tag/v0.7.0
[0.6.0]: https://github.com/bubuding0809/banana-split-tma/releases/tag/v0.6.0
