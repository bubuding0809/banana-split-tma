# Changelog

All notable changes to `@banananasplitz/cli` are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
