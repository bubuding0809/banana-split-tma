# Expense Categories — UAT Test Plan

**Date:** 2026-04-20
**Covers:** PR #165 (expense categories feature) + PR #167 (UAT follow-up fixes, rolling)
**Spec:** [`2026-04-20-expense-categories-design.md`](./2026-04-20-expense-categories-design.md)

## How to run

Steps are walked one at a time. Each has an **expected** result and a **pass / fail** checkbox. If a step fails, note the failure mode, push a fix to `fix/categories-uat-followups`, and re-run that step.

## Environment

- **Branch:** `fix/categories-uat-followups` deployed to a test env, or run locally via Tailscale tunnel.
- **Env vars (lambda):** `GOOGLE_GENERATIVE_AI_API_KEY` set. Optional `AGENT_MODEL` (defaults to `gemini-3.1-flash-lite-preview`).
- **Test chat:** a group chat with at least 3 existing expenses (mix of categorized + uncategorized) and 1 settlement. A personal chat for the isolation checks.
- **Test user:** a Telegram account that's a member of the test chat and can use the Mini App.

---

## Flow 1 — Add expense (core auto-assign UX)

- [ ] **1.1 Three-step form.** Open Add Expense. Confirm step indicator shows **3 steps** — Amount / Paid by / Split — not 4. Category is not its own step.

- [ ] **1.2 Empty state styling.** On step 1 (Amount), scroll to the Category Section (below Details). Cell shows a blue `+` icon (link-colored square), title "Pick a category" in link color. Section footer reads "Helps you track spending by type."

- [ ] **1.3 Auto-assign happy path.** Type "biryani lunch" in the description field. Within ~500ms a chef-hat pending pill appears on the Category cell's right side (bouncing animation). Footer switches to "Cooking up a category…". Shortly after, the cell updates to 🍜 Food and the Auto sparkle badge appears. Footer becomes "Auto-picked from description. Tap to change."

- [ ] **1.4 Rapid-typing race.** Clear the description. Type quickly: "bir" pause "biryani" pause "biryani lunch". Confirm the final category matches the final description (not a stale earlier one). No flicker between unrelated categories.

- [ ] **1.5 Picker opens with Uncategorized tile.** Tap the Category cell. Modal opens. Top of the grid has a single 📭 Uncategorized tile. Below: Base section (10 tiles).

- [ ] **1.6 Manual override clears the Auto badge.** From the picker, tap a different category (e.g. 🛒 Groceries). Sheet closes. Cell updates to the chosen category. Auto sparkle badge is gone. Footer reverts to "Helps you track spending by type."

- [ ] **1.7 Picking Uncategorized clears.** Open picker again, tap 📭 Uncategorized. Sheet closes. Cell returns to the empty state (blue `+`, "Pick a category").

- [ ] **1.8 Submit with category.** Fill in Amount, advance through Paid by / Split, submit. New expense appears in the transactions list. Amount row has the category emoji adjacent to the amount.

- [ ] **1.9 Submit without category.** Repeat 1.8 but leave category empty. Expense lands in list with no emoji next to the amount.

## Flow 2 — Edit expense (regression test — the clear-to-Uncategorized bug)

- [ ] **2.1 Pre-populated category.** Open an existing categorized expense → detail modal → Edit. Form opens on step 1. Category cell already shows the expense's current category emoji + title. **No Auto sparkle badge** (auto-assign disabled on edit).

- [ ] **2.2 Description edits don't trigger suggest.** Clear and retype the description on the edit form. The chef-hat pending pill does **not** appear. Footer stays "Auto-picked from description…" or the default state — not "Cooking up a category…".

- [ ] **2.3 Change to a different category.** Open picker, pick another category (e.g. ✈️ Travel). Save. Transactions list row shows the new emoji.

- [ ] **2.4 ⚠️ CRITICAL — Clear to Uncategorized.** Edit a currently-categorized expense. Open picker, tap 📭 Uncategorized. Save. Open the expense's detail modal → confirm no category shown. Transactions list row no longer shows the emoji.

## Flow 3 — Transactions filter

- [ ] **3.1 Dashed CTA pill.** Open Transactions tab. Filter cell includes a dashed "Category" pill (first position, muted) alongside the existing filter pills.

- [ ] **3.2 Cap + overflow.** Toggle Payments + Related-only filters. Confirm no more than 2 pills inline + a `+N` pill for the overflow. Tap the `+N` pill or the cell itself → filter modal opens.

- [ ] **3.3 Filter to Food.** From the filter cell's dashed pill, open picker. Tap 🍜 Food. Pill becomes solid "🍜 Food" with an X. List shows only Food-tagged expenses. Settlements are still visible.

- [ ] **3.4 Filter to Uncategorized.** Open picker, tap 📭 Uncategorized. Pill becomes "📭 Uncategorized". List shows only rows without a category. Settlements still visible.

- [ ] **3.5 Clear via X.** Tap the X on the active category pill. Pill returns to the dashed CTA form. All expenses visible again.

- [ ] **3.6 Filter modal Category row.** Open the filter modal (tap the cell or `+N`). The top row is a Category row — shows 🗂️ + "Category" when no filter active, or the selected emoji + title with a "Clear" button when active. Tapping the row opens the picker.

- [ ] **3.7 Custom category in filter.** Create a custom category in Manage first (Flow 4). Open picker from filter → the custom is listed under its own Custom section (above Base). Filter by it → list filters correctly.

## Flow 4 — Manage categories (chat settings)

- [ ] **4.1 Section placement.** Chat → `⋯` → Chat Settings. CATEGORIES section sits between BASE CURRENCY and NOTIFICATIONS. Preview chip strip under the cell shows up to 4 categories (customs first if any) + `+N more` if the total exceeds 4.

- [ ] **4.2 Footer copy varies by chat type.** In a **group** chat, footer reads "Categories are shared by everyone in this group and help auto-assign recurring expenses." In a **personal** chat, "Categories are private to this chat."

- [ ] **4.3 Manage page.** Tap "Manage categories" cell. Page shows:
  - CUSTOM section with empty state "No custom categories yet" initially, or the list of customs.
  - BASE section with all 10 base categories (read-only).
  - MainButton: "Create custom category".

- [ ] **4.4 Create custom category.** Tap MainButton → form opens. Type emoji (e.g. 🏖️) and title (e.g. "Bali trip"). Save button disabled if either field empty. Tap Save → returns to Manage page → new custom row appears in CUSTOM section.

- [ ] **4.5 Edit custom category.** Tap an existing custom row → edit form. Change title. Save. Manage page reflects the update.

- [ ] **4.6 Duplicate title conflict.** Try creating or editing a custom with the same title as another (case-insensitive — e.g. "bali trip" when "Bali trip" exists). Server rejects with CONFLICT; Snackbar shows "A category with this title already exists in this chat". No row created/modified.

- [ ] **4.7 Delete custom category.** In edit mode, tap "Delete category". `window.confirm` prompts. Confirm → returns to Manage → row gone. If any expenses were using this category, those expenses now show no emoji on the transactions list (cascade-null).

- [ ] **4.8 Back navigation.** Back from Manage → returns to Chat Settings. Back from Chat Settings → returns to transactions tab.

## Flow 5 — Onboarding tooltip

- [ ] **5.1 First visit.** Fresh account or after `localStorage.clear()`. Visit the transactions tab. A violet sparkle tooltip appears above the filter cell: "New: Categories" + "Tap the filter to narrow by category. Manage custom categories in chat settings."

- [ ] **5.2 Dismiss.** Tap the X. Tooltip disappears.

- [ ] **5.3 Persistence.** Reload the tab. Tooltip does **not** reappear for this user + chat. Visit a different chat → tooltip appears there (per-chat scope).

## Flow 6 — Bot silent auto-assign

- [ ] **6.1 Create via bot.** In the Telegram group, create an expense through the bot (e.g. "Paid 12 for flat white"). Bot doesn't mention category in its response.

- [ ] **6.2 Mini App reflects category.** Open Mini App → transactions tab → the new expense has an emoji populated (likely ☕ or 🍜 depending on Gemini). Verify by opening the detail modal.

- [ ] **6.3 Classifier failure tolerated.** Force a failure (e.g., unset `GOOGLE_GENERATIVE_AI_API_KEY` in the lambda for this test, create an expense via bot). Expense still creates successfully, just with `categoryId = null` / no emoji.

## Flow 7 — CLI

- [ ] **7.1 List shows labels.** Run `node apps/cli/dist/cli.js list-expenses --chat <test-chat-id>`. Expense rows include `categoryLabel: "🍜 Food"` (or similar) where categorized; null / absent where not.

- [ ] **7.2 Base filter.** `... --category base:food` — only food expenses. Settlements pass through untouched.

- [ ] **7.3 Custom filter.** Find a custom category uuid in the DB (or from the Mini App's Manage page URL). `... --category chat:<uuid>` — only that custom's expenses.

- [ ] **7.4 Invalid filter.** `... --category garbage` — no error, just empty-or-settlements-only result. (The CLI doesn't need to validate the id shape — mismatches naturally filter to nothing.)

## Flow 8 — Cross-chat isolation

- [ ] **8.1 Custom categories are per-chat.** Create "Bali trip" custom in Chat A. In Chat B, Manage page does not show "Bali trip" in CUSTOM section. Add Expense in Chat B's picker does not offer "Bali trip".

## Flow 9 — Data-integrity edge cases

- [ ] **9.1 Short description no fire.** Type < 3 chars in description on Add Expense. Confirm no chef-hat pending pill ever appears. No suggest call in network tab.

- [ ] **9.2 Rate limit degrades gracefully.** Fire ~25 rapid description changes in one minute (each unique so the tRPC cache doesn't dedupe). After the 20th, subsequent calls return `{ categoryId: null }` and no sparkle lands. No error toast or form block.

- [ ] **9.3 Category used by expenses → deleted.** Create a custom category, assign it to an expense, then delete the custom. Confirm the expense still exists with null categoryId, rendered as uncategorized.

- [ ] **9.4 Existing uncategorized expenses.** Expenses created before this feature shipped have `categoryId = null`. Filter to 📭 Uncategorized to find them. Editing and picking a category saves it normally.

## Exit criteria

- All ⚠️ CRITICAL items pass (currently 2.4).
- All Flow 1 + Flow 2 items pass (the add/edit happy paths).
- Flow 3 (filter) items pass.
- Any Flow 4-9 failures are either fixed before merge, or explicitly accepted with a follow-up issue filed.

Once exit criteria met, disable auto-merge was already disabled — re-enable auto-merge on PR #167 and let CI land it.
