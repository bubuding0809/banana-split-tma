# Store Screenshots

Raycast requires 3–6 screenshots (max 6) at exactly **2000×1250 px** PNG, captured from inside Raycast's dev mode so the chrome matches the store listing exactly.

## Capture

1. Launch the extension in dev mode:
   ```bash
   pnpm --filter @apps/raycast dev
   ```
2. With Raycast focused on a BananaSplitz view, press **Cmd + Shift + .** (Window Capture). Raycast saves a perfectly sized PNG to this folder.
3. Name the files `bananasplitz-1.png`, `bananasplitz-2.png`, … `bananasplitz-6.png` so they sort and ship in the order you want them shown.

## What to shoot

Pick views that show the most informative state — populated lists, real balances, a counterparty with both positive and negative groups. Avoid empty states.

Suggested set (3–6 of these):

1. **Groups list** — multiple groups, balances visible
2. **Group detail** — split-panel view with your balance and recent expenses
3. **People list** — counterparties across groups
4. **Person detail** — per-group breakdown with Settle All / Nudge actions visible
5. **@bananasplitz AI — balance lookup** — `who owes me money across all groups?` with the response rendered
6. **@bananasplitz AI — expense creation** — confirmation dialog visible before mutation

## Rules

- Same background across the whole set (don't mix light and dark themes).
- No sensitive data: scrub real names, real chat IDs, real Telegram avatars before capture, or use a demo workspace.
- Screenshots must show Raycast only — no other apps in frame.
- 2000×1250 exactly. Window Capture produces this size when invoked inside Raycast; don't resize manually afterwards.

The stage script picks up everything in this folder at publish time, so once the PNGs are committed (or staged locally) the next `pnpm --filter @apps/raycast publish` includes them automatically.
