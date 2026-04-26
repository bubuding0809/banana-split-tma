# Banana Split TMA - Agent Instructions

## Project Overview

A Telegram Mini App (TMA) for expense tracking and splitting built with modern TypeScript stack in a Turborepo monorepo.

## Agent Tooling

- **Search — always use `mgrep`.** For any search task, invoke the `mgrep` skill instead of the built-in `Grep`, `Glob`, or `WebSearch` tools. Use `mgrep "query"` for local file/code searches and `mgrep --web "query"` for web searches. This applies to ad-hoc shell searches too (e.g. listing processes, scanning logs) — reach for `mgrep` before falling back to `ps | grep`, `find`, etc.

## Frontend Development Guidelines

### UI Framework & Components

- **Primary UI Library**: `@telegram-apps/telegram-ui` - Use this as the primary component library for consistent Telegram native look and feel
- **Icons**: `lucide-react` - Use for all iconography needs
- **Styling**: Tailwind CSS v4 with `@tailwindcss/vite` integration
- **Utility Functions**:
  - `clsx` for conditional class names
  - `tailwind-merge` for merging Tailwind classes
  - `cn` utility function from `@/utils/cn`

### Component Architecture

```
src/components/
   features/          # Feature-specific components grouped by domain
      Chat/           # Chat-related components (balance, expenses, transactions)
      Expense/        # Expense creation, editing, and management
      Settings/       # User and chat settings
      Snapshot/       # Snapshot creation, editing, and details
      User/           # User-specific components
   ui/                # Reusable UI components
```

### Form Handling Standards

- **Form Library**: `@tanstack/react-form` with `@tanstack/zod-adapter`
- **Validation**: `zod` schemas for type-safe validation
- **Multi-step Forms**: Use the established pattern:
  ```typescript
  const FORM_STEPS = [
    { title: "Step Name", component: StepComponent },
    // ...
  ];
  ```
- **Form Options**: Create separate `.type.ts` files for form schemas and types
- **Field Validation**: Use the `FieldInfo` component for consistent error display
- **Edit/Create Reusability**: Use the same form component for both create and edit flows by conditionally setting defaultValues based on whether data exists
  ```typescript
  const form = useAppForm({
    ...formOpts,
    defaultValues: existingData
      ? {
          field: existingData.field,
          // ... map existing data to form fields
        }
      : {
          field: "",
          // ... empty defaults for create mode
        },
  });
  ```

### State Management

- **API Layer**: `tRPC` with `@tanstack/react-query`
- **Type Safety**: Full end-to-end type safety from database to frontend
- **Data Fetching**: Use tRPC hooks (`.useQuery`, `.useMutation`, etc.)

### Routing

- **Router**: `@tanstack/react-router` for type-safe navigation
- **Route Structure**:
  ```
  /_tma              # TMA layout wrapper
    /chat            # Chat index
    /chat/$chatId    # Individual chat
    /chat/$chatId_/add-expense    # Add expense flow
    /chat/$chatId_/settle-debt/$userId  # Settlement flow
  ```
- **Route APIs**: Use `getRouteApi()` for type-safe route access

## Telegram Mini App Integration

### SDK Usage

- **Primary SDK**: `@telegram-apps/sdk-react`
- **Key Hooks**:
  - `useSignal(initData.user)` for user data
  - `useSignal(themeParams)` for theming
  - `backButton`, `mainButton`, `secondaryButton` for navigation
  - `hapticFeedback` for user feedback

### Navigation Patterns

```typescript
// Back button setup
useEffect(() => {
  backButton.show();
  return backButton.onClick(() => {
    navigate({ to: "/previous-route" });
  });
}, []);

// Main button for primary actions
useEffect(() => {
  mainButton.setText("Continue");
  mainButton.setParams({ isVisible: true });
  return mainButton.onClick(handlePrimaryAction);
}, []);
```

### Theme Integration

- Use `themeParams` for dynamic styling
- Leverage Telegram's native color scheme
- Ensure proper contrast and accessibility

### Modal Patterns

#### Header Icon Buttons

- Use `IconButton` from `@telegram-apps/telegram-ui` for modal header actions
- Pattern: Pencil icon (`lucide-react`) for edit, X icon for close
- Always style with `themeParams` colors for native consistency
- Include haptic feedback on button interactions

```typescript
const tButtonColor = useSignal(themeParams.buttonColor);

<IconButton size="s" mode="gray" onClick={handleEdit} className="p-1">
  <Pencil size={20} strokeWidth={3} style={{ color: tButtonColor }} />
</IconButton>
```

#### Modal State Management

- Use Router search parameters for transient modal state
- Pre-load data before navigating to modal routes
- Implement proper loading states with skeleton components
- Examples: `ExpenseDetailsModal.tsx`, `SnapshotDetailsModal.tsx`

#### Stepped Instruction Modals (with mini-mockups)

For "what's about to happen" modals — especially flows that hand the user off
to a context the TMA can't render (bot DM, native pickers, external tools) —
use a vertical step path with mini Telegram-UI mockups under each step. Sets
expectations and reduces drop-off vs. plain text.

**Canonical implementation:** `apps/web/src/components/features/Settings/AddMemberSheet.tsx`

**Structure:**

1. **Quote block at the top** — short, humanist prompt with a left accent bar
   (`border-l-[3px]` themed via `themeParams.buttonColor`). Tone: name the
   actual pain point, not generic ("Wanna bring those friends who refuse to
   open the mini app?" beats "Add members to your group"). Don't describe
   mechanics — that's what the steps are for.

2. **Vertical step path** below the quote:
   - Each step has a `size-5 border-2` outlined circle with a `size-2` filled
     inner dot, both colored via `themeParams.buttonColor`. Same style for
     all steps — this is not a progress tracker.
   - Connector line runs absolute (`absolute bottom-0 left-[9px] top-6 w-[2px]`,
     `opacity: 0.5`) so it spans the full height of variable-sized step content.
   - Title is a `<div className="text-[15px] font-medium leading-snug">`, not
     `<Text>`, for explicit weight control. Allow `labelNode?: ReactNode` on
     the StepDef so titles can include inline elements like a styled pill
     referencing the actual CTA button below.

3. **Mini-mockups under steps** (only where they add value — skip for
   self-explanatory steps like "swipe back"):
   - Cards: `themeParams.secondaryBackgroundColor` for the surface; inner
     elements use subtle `bg-white/5` overlays.
   - Stack multiple cards under one step when it spans multiple UI surfaces
     (e.g., a reply-keyboard button THEN the contact picker it opens).
   - Each card gets a **numbered sub-instruction** above it
     (`1. Tap the keyboard button to open the contact picker`,
     `2. Pick your friends`) in `text-[12px]` muted color
     (`themeParams.subtitleTextColor`).
   - Use random placeholder names ("Alex Carter", "Sam Wilson") in mockups —
     not skeleton bars, not real-looking names that suggest specific people.

4. **Single primary CTA** (`<Button stretched size="l" mode="filled">`).
   No Cancel button — the modal's X icon handles dismissal. Trailing
   `ArrowRight` icon via the `after` prop is consistent with the "let's go"
   feel.

**Skip this pattern for:** simple confirmation modals, multi-step forms (use
the form-step convention instead), or anything where the user already knows
what's coming.

## Code Conventions

### File Naming

- **Components**: PascalCase (e.g., `AddExpensePage.tsx`)
- **Types**: PascalCase with descriptive suffixes (e.g., `AddExpenseForm.type.ts`)
- **Routes**: kebab-case with TanStack Router conventions
- **Utilities**: camelCase (e.g., `cn.ts`)

### TypeScript Patterns

- Use strict TypeScript configuration
- Prefer interface over type for object shapes
- Use branded types for IDs when needed
- Leverage Prisma-generated types
- **Never use `any`** - Use `unknown` with proper type narrowing, or cast through `unknown` if absolutely necessary (e.g., `value as unknown as ExpectedType`)

### Component Patterns

```typescript
// Standard component structure
interface ComponentProps {
  // Props definition
}

const Component = ({ prop }: ComponentProps) => {
  // Hooks
  // State
  // Effects
  // Handlers
  // Render
};

export default Component;
```

### Form Validation Patterns

```typescript
// Form schema definition
export const formSchema = z.object({
  field: z.string().min(1, "Field is required"),
});

// Form options
export const formOpts = formOptions({
  defaultValues: { field: "" },
  validators: { onChange: formSchema },
});
```

### UI Constants

**Location**: `/constants/ui.ts`

Centralized constants for consistent UI behavior:

- `ANIMATION_DURATIONS` - Standard timing for animations (highlight, badge pop/shake)
- `SCROLL_MARGINS` - Top margin offsets for scroll-to positioning
- `CSS_CLASSES` - Reusable animation class names (select highlight, badge animations)

```typescript
import { ANIMATION_DURATIONS, CSS_CLASSES } from "@/constants/ui";

// Use in animations
setTimeout(() => setHighlight(false), ANIMATION_DURATIONS.HIGHLIGHT);
className={cn("base-class", isHighlighted && CSS_CLASSES.SELECT_HIGHLIGHT)}
```

## Database Integration

### Prisma Patterns

- Use BigInt for user IDs (Telegram user IDs)
- Follow established model relationships
- Use proper indexing for performance queries
- Implement cascading deletes appropriately

### Telegram Message Tracking

- Store `telegramMessageId` (Int) for expense notifications to enable editing
- Track update bumps with `telegramUpdateBumpMessageIds` (Int[]) array
- Pattern: Edit original messages instead of creating duplicates
- Graceful fallback if message ID not available

**Message Handler Files** (in tRPC package):

- `telegram/sendExpenseNotificationMessage.ts` - Initial notification creation
- `telegram/editExpenseNotificationMessage.ts` - Message editing and update bumps
- `telegram/deleteExpenseNotificationMessage.ts` - Cleanup on deletion

### tRPC Router Structure

```typescript
// Input/Output schemas
export const inputSchema = z.object({
  // Define input validation
});

export const outputSchema = z.object({
  // Define output shape
});

// Handler function
export const handlerFunction = async (input, db) => {
  // Implementation
};

// Procedure definition
export default publicProcedure
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input, ctx }) => {
    return handlerFunction(input, ctx.db);
  });
```

## Backend Architecture

### Monorepo Structure

- `apps/lambda` - Express.js API server deployed to AWS Lambda
- `packages/trpc` - tRPC router definitions, procedures, and handlers
- `packages/database` - Prisma schema and generated client

### tRPC Procedure Organization

Each router is domain-focused (expense, snapshot, chat, telegram, etc.) with procedures in separate files for maintainability. The pattern shown in "tRPC Router Structure" above is followed consistently.

**File Structure Example**:

```
packages/trpc/src/routers/
├── expense/
│   ├── index.ts          # Router definition
│   ├── createExpense.ts  # Procedure
│   └── updateExpense.ts  # Procedure
└── telegram/
    ├── sendExpenseNotificationMessage.ts
    └── editExpenseNotificationMessage.ts
```

### AWS Integration

- Lambda function hosts Express API
- Telegram Bot API for notifications
- Environment-based configuration for deployments

## Development Workflows

### Local Development Setup

**Prerequisites** (install once per machine):

- Node.js 22+ and `pnpm` (enable with `corepack enable`)
- Docker Desktop or OrbStack (for the local Postgres container)
- Tailscale — either the [Mac App Store app](https://apps.apple.com/us/app/tailscale/id1475387142) or `brew install tailscale`
  - If you installed via the Mac App Store, the `tailscale` CLI is not on PATH by default. Add `alias tailscale='/Applications/Tailscale.app/Contents/MacOS/Tailscale'` to your `~/.zshrc` for interactive use. The `scripts/tunnel.sh` script already falls back to this binary automatically.

**First-time setup** (run once per clone):

```bash
git clone git@github.com:bubuding0809/banana-split-tma.git
cd banana-split-tma
pnpm install

# Copy env examples and fill in secrets
cp packages/database/.env.example packages/database/.env
cp apps/web/.env.example apps/web/.env.local
# Edit apps/web/.env.local with your Tailscale URLs — see "Local Development Tunneling" below.
# Ask a teammate for VITE_API_KEY and the Telegram bot token if the project uses them.

# Start local Postgres (pinned to postgres:17 in docker-compose.yaml; data persists in a named volume)
docker compose up -d postgres

# Apply all migrations to the local DB
pnpm --filter @dko/database exec prisma migrate deploy

# (One-time) set up the Tailscale tunnel — see "Local Development Tunneling" below.
```

**Daily workflow**:

```bash
pnpm dev:tunnel   # Starts Tailscale funnels + all dev servers
# Ctrl+C to stop; tunnels tear down automatically.
```

### Environment Variables by App

Each app validates its required env at boot (mostly via `@t3-oss/env-core`, see each app's `env.ts` / `src/env.ts`). Use the `.env.example` file as the canonical template — if the schema ever drifts from the example, trust the schema and update the example.

| App / Package                | Env file to create                                        | Template                                 | Validation schema                                                          |
| ---------------------------- | --------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------- |
| `apps/web` (TMA frontend)    | `apps/web/.env.local`                                     | `apps/web/.env.example`                  | `apps/web/vite.config.ts` (validated via `@julr/vite-plugin-validate-env`) |
| `apps/admin` (admin UI)      | `apps/admin/.env.local`                                   | `apps/admin/.env.example`                | `apps/admin/src/utils/trpc.ts`                                             |
| `apps/bot` (Telegram bot)    | `apps/bot/.env`                                           | `apps/bot/.env.example`                  | `apps/bot/src/env.ts`                                                      |
| `apps/lambda` (API/tRPC)     | `apps/lambda/env/.env.development` (or `.env.production`) | `apps/lambda/env/.env.<env>.example`     | `apps/lambda/api/env.ts`                                                   |
| `apps/mcp` (MCP server)      | `apps/mcp/.env.development` / `.env.production`           | committed in repo (edit values directly) | none                                                                       |
| `packages/database` (Prisma) | `packages/database/.env`                                  | `packages/database/.env.example`         | `packages/database/prisma/schema.prisma` (env() references)                |

**Cross-app variable consistency rules** — these have to match across apps to authenticate:

- `API_KEY` on `apps/bot` **must equal** `API_KEY` on `apps/lambda` (bot calls lambda's tRPC with `x-api-key`). Same value also goes into `VITE_API_KEY` on `apps/web` and `apps/admin`.
- `INTERNAL_AGENT_KEY` on `apps/bot` **must equal** `INTERNAL_AGENT_KEY` on `apps/lambda`.
- `TELEGRAM_BOT_TOKEN` on `apps/bot` and `apps/lambda` both point at the **same** bot — use `@BananaSplitzStgBot` (the staging bot) for local dev, not the prod bot.
- `MINI_APP_DEEPLINK` in `apps/bot` is the Telegram deep link (`https://t.me/<BotUsername>?startapp`), **not** your tunnel URL. The tunnel URL goes into `VITE_TRPC_URL` in `apps/web/.env.local` (pointing at your `:8081` backend funnel).

**Mini App URL confusion — common setup mistake**:

There are two different "mini app URLs", and they go in different places:

1. `MINI_APP_DEEPLINK` (`apps/bot/.env`): `https://t.me/BananaSplitzStgBot?startapp={command}` — the Telegram deep link **template** the bot posts in "Open App" buttons. The `{command}` placeholder is required — `apps/bot/src/utils/chat.ts:createMiniAppUrl` substitutes it with the encoded chat context. `{botusername}` and `{mode}` are optional substitutions. Always a `t.me/...` URL (staging vs prod bot), never your tunnel URL.
2. **The TMA URL registered with BotFather** (`/setmenubutton` → "Configure Mini App" → Main App URL): `https://<your-tailscale>.ts.net:8443/home` — where Telegram actually loads the web app from. This is per-developer and per-machine; each contributor sets their own via BotFather.

If users open the bot and land on the wrong app, check (2). If the "Open App" button in bot messages is broken, check (1).

**Quick DB operations**:

- `docker compose up -d postgres` — start the DB container
- `docker compose stop postgres` — stop it without losing data
- `docker compose down -v` — stop **and wipe** the data volume (destructive)
- `pnpm --filter @dko/database exec prisma studio` — open a DB GUI in the browser
- `pnpm --filter @dko/database exec prisma migrate dev --name <change>` — author a new migration from schema changes

### Post-deploy UAT workflow

After a PR auto-merges and the prod deploy finishes, split UAT between a subagent and the user:

**Subagent-driven UAT** (`general-purpose` subagent, one-shot) — for anything the agent can assert programmatically:

- CLI behavior: dispatch `node apps/cli/dist/cli.js ...` against prod, parse JSON responses.
- tRPC input/output shapes and new fields.
- DB state: `get-expense`/`get-chat`/etc. between steps to confirm reads/writes landed.
- Per-row counters (`succeeded`/`noop`/`failed`) and downstream effects like `summary.sent`.

Brief the subagent like a smart colleague: what PR shipped, what to test, concrete JSON templates for scratch files, chat IDs, and explicit cleanup instructions. The subagent must delete every scratch row it creates — DEV-BOX-2 accumulates cruft otherwise. Don't use `run_in_background: true` for UAT; you want the structured report back before moving on.

**Manual UAT via `AskUserQuestion`** — for anything user-facing that the agent cannot see:

- Telegram message rendering (emoji, blockquotes, MarkdownV2 escapes, thread IDs, message-edit vs new-message behavior).
- TMA web UI (toggle switches, haptic feedback, optimistic updates, form edit/create flows).
- Bot handler UX (slash commands, update bumps, keyboards).
- Anything where the user's eye is the ground truth.

The subagent should **always** return a "user-verify items" section listing Telegram `messageId`s and expected visual outcomes, so the user can cross-check in-app in one pass instead of having to re-derive what should be there. Established pattern in PRs #201, #202, #203.

**What to never delegate:**

- Git/PR operations (commits, pushes, merges) — main session only.
- Scope decisions — what to ship, what to cut.
- Actions affecting shared state outside this repo/DB (e.g. posting to chats the user hasn't authorized, sending group reminders) without prior approval.

### Git Workflows for Features and Hotfixes

**CRITICAL**: When starting any new feature or hotfix, you MUST use isolated git worktrees rather than checking out branches in the main workspace.

1. Invoke the `using-git-worktrees` superpower skill to create an isolated environment.
2. Perform all development, testing, and hotfixing within that specific worktree.
3. This prevents dirty states, protects the main workspace, and allows for clean, parallel development contexts.

### Monorepo Commands

- `turbo dev` - Start all development servers
- `turbo build` - Build all packages
- `turbo check-types` - TypeScript checking across all packages
- `turbo lint` - ESLint with auto-fix across all packages
- `turbo start` - Start production servers
- `turbo db:generate` - Regenerate Prisma client
- `turbo db:migrate` - Run database migrations
- `turbo db:deploy` - Deploy migrations to production
- `turbo db:push` - Push database schema changes
- `turbo db:reset` - Reset database
- `pnpm format` - Format code with Prettier

### Local Development Tunneling (Tailscale Funnel)

Uses Tailscale Funnel for persistent HTTPS tunnels to expose local dev servers to Telegram.

**Each developer configures their own tunnel URLs** in `apps/web/.env.local` (git-ignored). To find your Tailscale FQDN, run `tailscale status` or check the Tailscale admin console.

**URL pattern**:

- Frontend: `https://<your-tailscale-hostname>:8443` (proxies to Vite on `localhost:5173`)
- Backend: `https://<your-tailscale-hostname>:8081` (proxies to the Lambda/Express API on `localhost:8081`)
- API: `https://<your-tailscale-hostname>:8081/api/trpc`

**Daily workflow**:

```bash
pnpm dev:tunnel    # Start tunnels + dev servers
```

**Tunnel-only commands**:

- `pnpm tunnel` - Start tunnels only
- `pnpm tunnel:stop` - Stop tunnels
- `tailscale funnel status` - Check tunnel status

**Configuration files**:

- `scripts/tunnel.sh` - Start script
- `scripts/tunnel-stop.sh` - Stop script
- `apps/web/.env.local` - Local dev environment (git-ignored)

**First-time setup**:

1. Install Tailscale — either the [Mac App Store app](https://apps.apple.com/us/app/tailscale/id1475387142) (daemon auto-starts) or `brew install tailscale` followed by `sudo tailscaled install-system-daemon`.
2. Authenticate: `tailscale up`
3. Enable Funnel in admin console: https://login.tailscale.com/admin/dns

### Vercel CLI

> **Skill**: Load `vercel-cli` skill before using Vercel CLI commands.

The `VERCEL_TOKEN` for use with `vercel --token` is stored in `.envrc` at the project root.

```bash
VERCEL_TOKEN=$(grep VERCEL_TOKEN .envrc | cut -d'"' -f2) vercel projects list
```

### Pre-commit Hooks

- Husky setup with lint-staged
- Automatic type checking, linting, and formatting
- Prevents commits with TypeScript errors

## Styling Guidelines

### Tailwind Usage

- Use utility classes for styling
- Leverage Tailwind's responsive design system
- Use semantic color names when possible
- Prefer composition over custom CSS

### Component Styling

```typescript
// Use cn utility for conditional classes
<div className={cn(
  "base-classes",
  condition && "conditional-classes",
  variant === "primary" && "variant-classes"
)} />
```

### Layout Patterns

- Use Telegram UI components for native feel
- Implement proper spacing with Tailwind spacing scale
- Ensure touch-friendly interface design

## Financial Utilities

### Decimal.js for Precision

**Critical**: Always use `Decimal` class for monetary calculations to prevent floating-point errors.

**Location**: `/utils/financial.ts`

**Key Functions**:

- `toDecimal(value)` - Convert number/string to Decimal for precision arithmetic
- `sumDecimals(values)` - Sum array of numbers with arbitrary precision
- `isSignificantAmount(amount)` - Check if amount ≥ 0.01 (worth displaying)
- `formatCurrencyWithCode(amount, code)` - Format with Intl.NumberFormat, fallback handling
- `getBalanceType(balance)` - Classify balance as 'positive', 'negative', or 'zero'
- `getBalanceColorClass(balance)` - Get Tailwind class for balance styling

**Pattern**: Backend handles all monetary calculations; frontend uses Decimal.js only for display-level math.

```typescript
import { toDecimal, sumDecimals, isSignificantAmount } from "@/utils/financial";

// Sum amounts with precision
const total = sumDecimals([12.99, 5.01, 3.5]);

// Check if worth displaying
if (isSignificantAmount(balance)) {
  // Show balance
}
```

## Error Handling

### Form Errors

- Use `FieldInfo` component for validation errors
- Implement proper error states in UI
- Provide clear, actionable error messages

### API Errors

- Handle tRPC errors gracefully
- Provide user-friendly error feedback
- Use Telegram's haptic feedback for error states

## Performance Considerations

### List Virtualization

- Use `@tanstack/react-virtual` for large lists (>20 items)
- Pattern: `useVirtualizer` hook with dynamic height estimation
- Memoize list item components with `React.memo()` and set `displayName`
- Use `overscan: 3` for smooth scrolling with item buffer
- Example implementations: `VirtualizedExpenseList.tsx`, `VirtualizedCombinedTransactionSegment.tsx`

```typescript
const virtualizer = useVirtualizer({
  count: items.length,
  getScrollElement: () => parentRef.current,
  estimateSize: (index) => {
    // Dynamic height based on content
    return items[index].hasLongDescription ? 80 : 60;
  },
  overscan: 3,
});
```

### Code Splitting

- Leverage Vite's automatic code splitting
- Use dynamic imports for large components
- Optimize bundle size for mobile

### Data Fetching

- Use tRPC's built-in caching
- Implement proper loading states
- Handle offline scenarios gracefully

## Security Considerations

### Telegram Integration

- Validate Telegram user data
- Implement proper authentication
- Handle chat permissions correctly

### Data Validation

- Always validate inputs on both client and server
- Use Zod schemas for runtime validation
- Sanitize user inputs appropriately

## Debugging

### Development Tools

- React DevTools for component debugging
- TanStack Query DevTools for API debugging
- Vite's HMR for fast development cycles
- **eruda** - Mobile console debugging tool (injected in development mode)

### Telegram Testing

- Use Telegram's Web App testing tools
- Test on both desktop and mobile Telegram clients
- Verify theme adaptation across devices

---

## Quick Reference

### Key Dependencies

```json
{
  "@telegram-apps/telegram-ui": "UI components",
  "@telegram-apps/sdk-react": "Telegram SDK",
  "@tanstack/react-form": "Form handling",
  "@tanstack/react-router": "Routing",
  "@tanstack/react-query": "Data fetching/caching",
  "@tanstack/react-virtual": "Virtual scrolling",
  "lucide-react": "Icons",
  "tailwindcss": "Styling (v4)",
  "zod": "Validation",
  "decimal.js": "Financial precision",
  "date-fns": "Date utilities",
  "superjson": "JSON serialization"
}
```

### Common Patterns

- Multi-step forms with validation
- tRPC for type-safe APIs
- Telegram theme integration
- Responsive mobile-first design
- Proper error handling and user feedback
- List virtualization for performance
- Financial calculations with Decimal.js
- Modal patterns with icon buttons
- Edit/Create form reusability
