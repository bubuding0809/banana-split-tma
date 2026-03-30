# Banana Split TMA - Agent Instructions

## Project Overview

A Telegram Mini App (TMA) for expense tracking and splitting built with modern TypeScript stack in a Turborepo monorepo.

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

- Frontend: `https://<your-tailscale-hostname>:8443`
- Backend: `https://<your-tailscale-hostname>`
- API: `https://<your-tailscale-hostname>/api/trpc`

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

1. Install: `brew install tailscale`
2. Start daemon: `sudo tailscaled install-system-daemon`
3. Authenticate: `tailscale up`
4. Enable Funnel in admin console: https://login.tailscale.com/admin/dns

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
