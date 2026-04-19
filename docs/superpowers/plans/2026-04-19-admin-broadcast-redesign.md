# Admin Broadcast Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the admin "Send Message" feature with shadcn/ui + Emil-style polish, add a live Telegram-style preview, add username search for specific-user targeting, and remove the now-unused `testBroadcast` endpoint.

**Architecture:** Single Vite + React admin page (`apps/admin`). A new `BroadcastPage` owns the state and renders a two-column split (MDEditor composer left, Telegram preview right) above a sticky footer bar (Audience popover + Broadcast button). shadcn primitives live under `components/ui/`, feature components under `components/broadcast/`. Backend is untouched apart from deleting `testBroadcast`.

**Tech Stack:** React 19, Vite 6, Tailwind CSS v4 (`@tailwindcss/vite`), shadcn/ui (cmdk, Radix primitives), Sonner, Framer Motion, `marked`, `DOMPurify`, existing `@uiw/react-md-editor`, tRPC (existing `trpc.admin.getUsers` + `trpc.admin.broadcastMessage`).

**Spec deviations:**
- Spec §9 called for Vitest component tests. The admin app has no Vitest setup today (nor does any other app in the monorepo — `test` in `turbo.json` is scaffolded but unused). Adding Vitest is out of scope for this redesign; it would double the PR size and is not a UI/design concern. **Plan substitutes manual UAT** (§UAT task at the end) for initial rollout. A follow-up plan can add Vitest later.

---

## File Structure

**Created:**
- `apps/admin/components.json` — shadcn config
- `apps/admin/src/lib/utils.ts` — `cn()` helper
- `apps/admin/src/components/ui/*.tsx` — shadcn primitives (button, badge, popover, command, dialog, input, scroll-area, separator, sonner)
- `apps/admin/src/components/broadcast/BroadcastPage.tsx`
- `apps/admin/src/components/broadcast/MessageComposer.tsx`
- `apps/admin/src/components/broadcast/TelegramPreview.tsx`
- `apps/admin/src/components/broadcast/AudienceBar.tsx`
- `apps/admin/src/components/broadcast/AudiencePopover.tsx`
- `apps/admin/src/components/broadcast/BroadcastButton.tsx`
- `apps/admin/src/components/broadcast/ConfirmBroadcastDialog.tsx`
- `apps/admin/src/components/broadcast/FailuresDialog.tsx`
- `apps/admin/src/hooks/useUsers.ts`

**Modified:**
- `apps/admin/src/App.tsx` — render `<BroadcastPage>` + mount Sonner `<Toaster>`
- `apps/admin/src/index.css` — add shadcn theme tokens (Tailwind v4 `@theme`)
- `apps/admin/package.json` — new deps
- `apps/admin/vite.config.ts` — (only if path alias needs adjustment; already has `@` → `/src`)
- `packages/trpc/src/routers/admin/index.ts` — remove `testBroadcast` registration

**Deleted:**
- `apps/admin/src/components/BroadcastDashboard.tsx`
- `apps/admin/src/components/TargetAudienceSelector.tsx`
- `packages/trpc/src/routers/admin/testBroadcast.ts`

---

### Task 1: Initialize shadcn/ui in the admin app

**Files:**
- Create: `apps/admin/components.json`
- Create: `apps/admin/src/lib/utils.ts`
- Modify: `apps/admin/src/index.css`
- Modify: `apps/admin/package.json`
- Modify: `apps/admin/tsconfig.json` (add `baseUrl` + `paths` for `@/*` imports)

- [ ] **Step 1: Add TypeScript path alias**

`apps/admin/tsconfig.json` — add `baseUrl` and `paths` to the existing `compilerOptions`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "allowJs": true,
    "strict": true,
    "noEmit": false,
    "outDir": "./dist",
    "rootDir": "./src",
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "jsx": "react-jsx",
    "types": ["node"],
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

(Vite alias is already configured in `vite.config.ts`.)

- [ ] **Step 2: Create `cn` helper**

Create `apps/admin/src/lib/utils.ts`:

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 3: Create `components.json`**

Create `apps/admin/components.json`:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/index.css",
    "baseColor": "stone",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

- [ ] **Step 4: Replace `index.css` with shadcn v4 theme tokens**

Replace contents of `apps/admin/src/index.css`:

```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

:root {
  --background: oklch(0.99 0 0);
  --foreground: oklch(0.15 0.005 285);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.15 0.005 285);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.15 0.005 285);
  --primary: oklch(0.44 0.025 150);
  --primary-foreground: oklch(0.97 0.02 130);
  --secondary: oklch(0.97 0.003 85);
  --secondary-foreground: oklch(0.2 0.01 285);
  --muted: oklch(0.97 0.003 85);
  --muted-foreground: oklch(0.52 0.01 285);
  --accent: oklch(0.97 0.003 85);
  --accent-foreground: oklch(0.2 0.01 285);
  --destructive: oklch(0.58 0.22 27);
  --destructive-foreground: oklch(0.98 0 0);
  --border: oklch(0.92 0.004 285);
  --input: oklch(0.92 0.004 285);
  --ring: oklch(0.44 0.025 150);
  --radius: 0.5rem;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius-lg: var(--radius);
  --radius-md: calc(var(--radius) - 2px);
  --radius-sm: calc(var(--radius) - 4px);
}

@layer base {
  * {
    border-color: var(--border);
  }
  body {
    background-color: var(--background);
    color: var(--foreground);
    font-feature-settings: "cv02", "cv03", "cv04", "cv11";
  }
}
```

Palette rationale: `stone` base + sage primary (`oklch(0.44 0.025 150)`) matches Style B from the spec.

- [ ] **Step 5: Install shadcn + its dependencies**

Run from the **repo root** (pnpm workspace):

```bash
pnpm --filter admin add class-variance-authority lucide-react@latest @radix-ui/react-slot @radix-ui/react-popover @radix-ui/react-dialog @radix-ui/react-separator @radix-ui/react-scroll-area cmdk sonner framer-motion marked isomorphic-dompurify tw-animate-css
pnpm --filter admin add -D @types/marked
```

(`lucide-react`, `clsx`, `tailwind-merge` already present — reinstalling `lucide-react` is a no-op.)

- [ ] **Step 6: Commit**

```bash
git add apps/admin/components.json apps/admin/src/lib/utils.ts apps/admin/src/index.css apps/admin/tsconfig.json apps/admin/package.json pnpm-lock.yaml
git commit -m "chore(admin): initialize shadcn/ui + tailwind v4 theme"
```

---

### Task 2: Add shadcn primitive components

**Files:**
- Create: `apps/admin/src/components/ui/button.tsx`
- Create: `apps/admin/src/components/ui/badge.tsx`
- Create: `apps/admin/src/components/ui/input.tsx`
- Create: `apps/admin/src/components/ui/popover.tsx`
- Create: `apps/admin/src/components/ui/command.tsx`
- Create: `apps/admin/src/components/ui/dialog.tsx`
- Create: `apps/admin/src/components/ui/separator.tsx`
- Create: `apps/admin/src/components/ui/scroll-area.tsx`
- Create: `apps/admin/src/components/ui/sonner.tsx`

- [ ] **Step 1: Run shadcn CLI to add the primitives**

```bash
cd apps/admin
pnpm dlx shadcn@latest add button badge input popover command dialog separator scroll-area sonner --yes --overwrite
cd -
```

This generates the 9 files above. The CLI follows `components.json` from Task 1.

- [ ] **Step 2: Verify the admin app still compiles**

```bash
pnpm --filter admin check-types
```

Expected: zero TypeScript errors.

- [ ] **Step 3: Run the admin dev server as a sanity check**

```bash
pnpm --filter admin dev
```

Visit http://localhost:6820. The existing `BroadcastDashboard` should still render (it is not yet replaced). Stop the server (`Ctrl-C`) once verified.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/components/ui
git commit -m "feat(admin): add shadcn primitives for broadcast redesign"
```

---

### Task 3: Extract `useUsers` hook + scaffold `broadcast/` folder

**Files:**
- Create: `apps/admin/src/hooks/useUsers.ts`
- Create: `apps/admin/src/components/broadcast/` (folder only, populated in later tasks)

- [ ] **Step 1: Create `useUsers.ts`**

```ts
// apps/admin/src/hooks/useUsers.ts
import { useMemo } from "react";
import { trpcReact } from "../utils/trpc";

export type AdminUser = {
  id: bigint;
  firstName: string;
  lastName: string | null;
  username: string | null;
};

export function useUsers() {
  const query = trpcReact.admin.getUsers.useQuery();
  const users = useMemo<AdminUser[]>(() => query.data ?? [], [query.data]);
  return { ...query, users };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/hooks/useUsers.ts
git commit -m "feat(admin): add useUsers hook"
```

---

### Task 4: Build `TelegramPreview`

**Files:**
- Create: `apps/admin/src/components/broadcast/TelegramPreview.tsx`

- [ ] **Step 1: Implement the component**

```tsx
// apps/admin/src/components/broadcast/TelegramPreview.tsx
import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "isomorphic-dompurify";
import { motion, AnimatePresence } from "framer-motion";

marked.setOptions({ breaks: true, gfm: true });

function splitIntoBubbles(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  return trimmed.split(/\n{2,}/g).map((b) => b.trim()).filter(Boolean);
}

function renderBubble(md: string): string {
  const html = marked.parse(md, { async: false }) as string;
  return DOMPurify.sanitize(html);
}

type Props = { value: string };

export function TelegramPreview({ value }: Props) {
  const bubbles = useMemo(() => splitIntoBubbles(value), [value]);

  return (
    <div className="flex h-full flex-col gap-2 rounded-lg bg-stone-900 p-4">
      <div className="text-[10px] uppercase tracking-wider text-stone-400">
        Telegram preview
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
        <AnimatePresence initial={false}>
          {bubbles.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="m-auto text-sm text-stone-500"
            >
              Start typing to see a preview.
            </motion.div>
          ) : (
            bubbles.map((b, i) => (
              <motion.div
                key={`${i}-${b.slice(0, 24)}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                className="max-w-[85%] self-start rounded-2xl bg-primary/80 px-3 py-2 text-sm text-primary-foreground shadow-sm"
                dangerouslySetInnerHTML={{ __html: renderBubble(b) }}
              />
            ))
          )}
        </AnimatePresence>
      </div>

      <p className="text-[11px] text-stone-500">
        Approximate preview. Telegram MarkdownV2 rendering may differ.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter admin check-types
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/components/broadcast/TelegramPreview.tsx
git commit -m "feat(admin): add TelegramPreview component"
```

---

### Task 5: Build `MessageComposer`

**Files:**
- Create: `apps/admin/src/components/broadcast/MessageComposer.tsx`

- [ ] **Step 1: Implement**

```tsx
// apps/admin/src/components/broadcast/MessageComposer.tsx
import MDEditor from "@uiw/react-md-editor";

type Props = {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
};

export function MessageComposer({ value, onChange, disabled }: Props) {
  return (
    <div className="flex h-full flex-col gap-2" data-color-mode="light">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        Compose
      </div>
      <div className="flex-1 overflow-hidden rounded-lg border">
        <MDEditor
          value={value}
          onChange={(v) => onChange(v ?? "")}
          height="100%"
          preview="edit"
          visibleDragbar={false}
          textareaProps={{ disabled }}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">
        Markdown (MarkdownV2) is sent to Telegram as-is.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/components/broadcast/MessageComposer.tsx
git commit -m "feat(admin): add MessageComposer wrapper"
```

---

### Task 6: Build `AudiencePopover` + `AudienceBar`

**Files:**
- Create: `apps/admin/src/components/broadcast/AudiencePopover.tsx`
- Create: `apps/admin/src/components/broadcast/AudienceBar.tsx`

- [ ] **Step 1: Implement `AudiencePopover`**

```tsx
// apps/admin/src/components/broadcast/AudiencePopover.tsx
import { useMemo, useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { useUsers, type AdminUser } from "@/hooks/useUsers";
import { Check, Users2, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

export type TargetMode = "all" | "specific";

type Props = {
  targetMode: TargetMode;
  onTargetModeChange: (m: TargetMode) => void;
  selectedUserIds: bigint[];
  onSelectedUserIdsChange: (ids: bigint[]) => void;
};

function userLabel(u: AdminUser) {
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || "(no name)";
  return u.username ? `${name} · @${u.username}` : name;
}

function matches(u: AdminUser, q: string) {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    u.firstName.toLowerCase().includes(needle) ||
    (u.lastName ?? "").toLowerCase().includes(needle) ||
    (u.username ?? "").toLowerCase().includes(needle)
  );
}

export function AudiencePopover({
  targetMode,
  onTargetModeChange,
  selectedUserIds,
  onSelectedUserIdsChange,
}: Props) {
  const { users, isLoading } = useUsers();
  const [query, setQuery] = useState("");

  const selectedSet = useMemo(
    () => new Set(selectedUserIds.map((id) => id.toString())),
    [selectedUserIds]
  );

  const { pinned, rest } = useMemo(() => {
    const filtered = users.filter((u) => matches(u, query));
    const pinned: AdminUser[] = [];
    const rest: AdminUser[] = [];
    for (const u of filtered) {
      if (selectedSet.has(u.id.toString())) pinned.push(u);
      else rest.push(u);
    }
    return { pinned, rest };
  }, [users, query, selectedSet]);

  const toggleUser = (u: AdminUser) => {
    const key = u.id.toString();
    if (selectedSet.has(key)) {
      onSelectedUserIdsChange(selectedUserIds.filter((id) => id.toString() !== key));
    } else {
      onSelectedUserIdsChange([...selectedUserIds, u.id]);
    }
  };

  return (
    <div className="flex w-[360px] flex-col gap-2">
      <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
        <button
          onClick={() => onTargetModeChange("all")}
          className={cn(
            "flex items-center justify-center gap-2 rounded px-3 py-1.5 text-xs font-medium transition-colors",
            targetMode === "all"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Users2 className="h-3.5 w-3.5" /> All users ({users.length})
        </button>
        <button
          onClick={() => onTargetModeChange("specific")}
          className={cn(
            "flex items-center justify-center gap-2 rounded px-3 py-1.5 text-xs font-medium transition-colors",
            targetMode === "specific"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <UserRound className="h-3.5 w-3.5" /> Specific ({selectedUserIds.length})
        </button>
      </div>

      {targetMode === "specific" && (
        <Command shouldFilter={false} className="rounded-md border">
          <CommandInput
            placeholder="Search by name or @username…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList className="max-h-64">
            {isLoading && <CommandEmpty>Loading users…</CommandEmpty>}
            {!isLoading && pinned.length === 0 && rest.length === 0 && (
              <CommandEmpty>No users match.</CommandEmpty>
            )}

            {pinned.length > 0 && (
              <CommandGroup heading="Selected">
                {pinned.map((u) => (
                  <CommandItem
                    key={u.id.toString()}
                    onSelect={() => toggleUser(u)}
                    className="flex items-center justify-between"
                  >
                    <span className="truncate">{userLabel(u)}</span>
                    <Check className="h-4 w-4 text-primary" />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {pinned.length > 0 && rest.length > 0 && <CommandSeparator />}

            {rest.length > 0 && (
              <CommandGroup heading="All">
                {rest.map((u) => (
                  <CommandItem
                    key={u.id.toString()}
                    onSelect={() => toggleUser(u)}
                    className="truncate"
                  >
                    {userLabel(u)}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
          {selectedUserIds.length > 0 && (
            <div className="flex items-center justify-between border-t px-2 py-1.5 text-xs text-muted-foreground">
              <span>{selectedUserIds.length} selected</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSelectedUserIdsChange([])}
              >
                Clear
              </Button>
            </div>
          )}
        </Command>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Implement `AudienceBar`**

```tsx
// apps/admin/src/components/broadcast/AudienceBar.tsx
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ChevronDown, Users2, UserRound } from "lucide-react";
import { AudiencePopover, type TargetMode } from "./AudiencePopover";
import { useUsers } from "@/hooks/useUsers";

type Props = {
  targetMode: TargetMode;
  onTargetModeChange: (m: TargetMode) => void;
  selectedUserIds: bigint[];
  onSelectedUserIdsChange: (ids: bigint[]) => void;
};

export function AudienceBar(props: Props) {
  const { users } = useUsers();
  const count =
    props.targetMode === "all" ? users.length : props.selectedUserIds.length;
  const Icon = props.targetMode === "all" ? Users2 : UserRound;
  const label = props.targetMode === "all" ? "All users" : "Specific";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 tabular-nums">
          <Icon className="h-4 w-4" />
          <span>{label}</span>
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
            {count}
          </span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="p-3">
        <AudiencePopover {...props} />
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter admin check-types
```

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/components/broadcast/AudiencePopover.tsx apps/admin/src/components/broadcast/AudienceBar.tsx
git commit -m "feat(admin): add audience popover with user search"
```

---

### Task 7: Build `ConfirmBroadcastDialog` + `FailuresDialog`

**Files:**
- Create: `apps/admin/src/components/broadcast/ConfirmBroadcastDialog.tsx`
- Create: `apps/admin/src/components/broadcast/FailuresDialog.tsx`

- [ ] **Step 1: Implement `ConfirmBroadcastDialog`**

```tsx
// apps/admin/src/components/broadcast/ConfirmBroadcastDialog.tsx
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipientCount: number;
  messageSnippet: string;
  isSending: boolean;
  onConfirm: () => void;
};

export function ConfirmBroadcastDialog({
  open,
  onOpenChange,
  recipientCount,
  messageSnippet,
  isSending,
  onConfirm,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send broadcast?</DialogTitle>
          <DialogDescription>
            This message will be sent to{" "}
            <span className="font-medium tabular-nums">{recipientCount}</span>{" "}
            user{recipientCount === 1 ? "" : "s"}. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-md border bg-muted/50 p-3 text-sm text-muted-foreground">
          <p className="line-clamp-4 whitespace-pre-wrap">
            {messageSnippet || "(empty)"}
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSending}
          >
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={isSending} className="gap-2">
            <Send className="h-4 w-4" />
            {isSending ? "Sending…" : "Send broadcast"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Implement `FailuresDialog`**

```tsx
// apps/admin/src/components/broadcast/FailuresDialog.tsx
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

export type BroadcastFailure = { userId: number; error: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  failures: BroadcastFailure[];
};

export function FailuresDialog({ open, onOpenChange, failures }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {failures.length} failed delivery{failures.length === 1 ? "" : "ies"}
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[50vh] rounded-md border">
          <ul className="divide-y text-sm">
            {failures.map((f, i) => (
              <li key={`${f.userId}-${i}`} className="flex flex-col gap-1 p-3">
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  user {f.userId}
                </span>
                <span className="text-destructive">{f.error}</span>
              </li>
            ))}
          </ul>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter admin check-types
```

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/components/broadcast/ConfirmBroadcastDialog.tsx apps/admin/src/components/broadcast/FailuresDialog.tsx
git commit -m "feat(admin): add confirm + failures dialogs"
```

---

### Task 8: Build `BroadcastButton` + assemble `BroadcastPage`

**Files:**
- Create: `apps/admin/src/components/broadcast/BroadcastButton.tsx`
- Create: `apps/admin/src/components/broadcast/BroadcastPage.tsx`

- [ ] **Step 1: Implement `BroadcastButton`**

```tsx
// apps/admin/src/components/broadcast/BroadcastButton.tsx
import { Button } from "@/components/ui/button";
import { Send, Loader2 } from "lucide-react";

type Props = {
  disabled?: boolean;
  isSending?: boolean;
  onClick: () => void;
};

export function BroadcastButton({ disabled, isSending, onClick }: Props) {
  return (
    <Button
      size="lg"
      onClick={onClick}
      disabled={disabled || isSending}
      className="gap-2"
    >
      {isSending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Send className="h-4 w-4" />
      )}
      {isSending ? "Sending…" : "Broadcast"}
    </Button>
  );
}
```

- [ ] **Step 2: Implement `BroadcastPage`**

```tsx
// apps/admin/src/components/broadcast/BroadcastPage.tsx
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { trpcReact } from "../../utils/trpc";
import { useUsers } from "@/hooks/useUsers";
import { Badge } from "@/components/ui/badge";
import { MessageComposer } from "./MessageComposer";
import { TelegramPreview } from "./TelegramPreview";
import { AudienceBar } from "./AudienceBar";
import { BroadcastButton } from "./BroadcastButton";
import { ConfirmBroadcastDialog } from "./ConfirmBroadcastDialog";
import { FailuresDialog, type BroadcastFailure } from "./FailuresDialog";
import type { TargetMode } from "./AudiencePopover";

export function BroadcastPage() {
  const [message, setMessage] = useState("");
  const [targetMode, setTargetMode] = useState<TargetMode>("all");
  const [selectedUserIds, setSelectedUserIds] = useState<bigint[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [failures, setFailures] = useState<BroadcastFailure[]>([]);
  const [failuresOpen, setFailuresOpen] = useState(false);

  const { users } = useUsers();
  const broadcast = trpcReact.admin.broadcastMessage.useMutation();

  const recipientCount =
    targetMode === "all" ? users.length : selectedUserIds.length;

  const disabledReason = useMemo(() => {
    if (!message.trim()) return "Write a message to enable broadcast.";
    if (targetMode === "specific" && selectedUserIds.length === 0) {
      return "Select at least one user.";
    }
    return null;
  }, [message, targetMode, selectedUserIds]);

  const handleConfirm = async () => {
    try {
      const result = await broadcast.mutateAsync({
        message,
        targetUserIds:
          targetMode === "specific"
            ? selectedUserIds.map((id) => Number(id))
            : undefined,
      });
      setConfirmOpen(false);
      const fail = result?.failCount ?? 0;
      const success = result?.successCount ?? 0;
      if (fail === 0) {
        toast.success(`Sent to ${success} ${success === 1 ? "user" : "users"}.`);
      } else {
        setFailures(result?.failures ?? []);
        toast.warning(
          `Sent to ${success}, failed for ${fail}.`,
          {
            action: {
              label: "View failures",
              onClick: () => setFailuresOpen(true),
            },
          }
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Broadcast failed — ${msg}`);
    }
  };

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b bg-background px-6 py-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">Broadcast</h1>
          <Badge variant="secondary" className="font-normal">
            Draft
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Compose once · deliver to every Telegram Mini App user
        </p>
      </header>

      <main className="grid flex-1 gap-4 overflow-hidden px-6 py-4 lg:grid-cols-[55fr_45fr]">
        <MessageComposer
          value={message}
          onChange={setMessage}
          disabled={broadcast.isPending}
        />
        <TelegramPreview value={message} />
      </main>

      <footer className="flex flex-col gap-2 border-t bg-background px-6 py-3">
        {disabledReason && (
          <p className="text-xs text-muted-foreground">{disabledReason}</p>
        )}
        <div className="flex items-center justify-between">
          <AudienceBar
            targetMode={targetMode}
            onTargetModeChange={setTargetMode}
            selectedUserIds={selectedUserIds}
            onSelectedUserIdsChange={setSelectedUserIds}
          />
          <BroadcastButton
            disabled={Boolean(disabledReason)}
            isSending={broadcast.isPending}
            onClick={() => setConfirmOpen(true)}
          />
        </div>
      </footer>

      <ConfirmBroadcastDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        recipientCount={recipientCount}
        messageSnippet={message.slice(0, 200)}
        isSending={broadcast.isPending}
        onConfirm={handleConfirm}
      />
      <FailuresDialog
        open={failuresOpen}
        onOpenChange={setFailuresOpen}
        failures={failures}
      />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter admin check-types
```

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/components/broadcast/BroadcastButton.tsx apps/admin/src/components/broadcast/BroadcastPage.tsx
git commit -m "feat(admin): assemble BroadcastPage with confirm + toast flow"
```

---

### Task 9: Swap `App.tsx` to use `BroadcastPage` + mount `<Toaster>`

**Files:**
- Modify: `apps/admin/src/App.tsx`

- [ ] **Step 1: Replace `App.tsx`**

```tsx
// apps/admin/src/App.tsx
import { QueryClientProvider } from "@tanstack/react-query";
import { trpcClient, trpcReact, queryClient } from "./utils/trpc";
import { BroadcastPage } from "./components/broadcast/BroadcastPage";
import { Toaster } from "@/components/ui/sonner";

export function App() {
  return (
    <trpcReact.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <BroadcastPage />
        <Toaster richColors closeButton position="bottom-right" />
      </QueryClientProvider>
    </trpcReact.Provider>
  );
}
```

- [ ] **Step 2: Start dev server and spot-check**

```bash
pnpm --filter admin dev
```

Visit http://localhost:6820. Expect:
- New split layout renders (composer left, dark preview panel right).
- Audience bar in footer opens a popover.
- Broadcast button is disabled while the message is empty.

Stop the server.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/App.tsx
git commit -m "feat(admin): mount BroadcastPage + Sonner Toaster"
```

---

### Task 10: Delete unused components + `testBroadcast` endpoint

**Files:**
- Delete: `apps/admin/src/components/BroadcastDashboard.tsx`
- Delete: `apps/admin/src/components/TargetAudienceSelector.tsx`
- Delete: `packages/trpc/src/routers/admin/testBroadcast.ts`
- Modify: `packages/trpc/src/routers/admin/index.ts`

- [ ] **Step 1: Remove admin-side files**

```bash
rm apps/admin/src/components/BroadcastDashboard.tsx
rm apps/admin/src/components/TargetAudienceSelector.tsx
```

- [ ] **Step 2: Update admin router**

Replace `packages/trpc/src/routers/admin/index.ts`:

```ts
import { createTRPCRouter } from "../../trpc.js";
import getUsers from "./getUsers.js";
import broadcastMessage from "./broadcastMessage.js";

export const adminRouter = createTRPCRouter({
  getUsers,
  broadcastMessage,
});
```

- [ ] **Step 3: Delete endpoint file**

```bash
rm packages/trpc/src/routers/admin/testBroadcast.ts
```

- [ ] **Step 4: Typecheck the whole monorepo**

```bash
pnpm -w check-types
```

Expected: passes. If anything else referenced `testBroadcast`, fix it now (nothing else should, based on current grep).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(admin): remove old broadcast UI and unused testBroadcast endpoint"
```

---

### Task 11: Emil-style polish pass

**Files:**
- Modify: `apps/admin/src/components/broadcast/BroadcastPage.tsx`
- Modify: `apps/admin/src/components/broadcast/AudienceBar.tsx`
- Modify: `apps/admin/src/components/broadcast/TelegramPreview.tsx` (already has motion)
- Modify: `apps/admin/src/index.css` (add `focus-visible` ring tune-up if needed)

Goal: small, surgical polish. Each sub-step is bounded.

- [ ] **Step 1: Spring-in the confirm dialog + audience popover**

shadcn Dialog/Popover already animate via `tw-animate-css`. Verify in browser. If the pop-in feels abrupt, tune `animate-in fade-in-0 zoom-in-95 duration-150` to `duration-200` in `apps/admin/src/components/ui/dialog.tsx` and `popover.tsx`.

- [ ] **Step 2: Tabular numerals for all counters**

Audit `BroadcastPage`, `AudienceBar`, `ConfirmBroadcastDialog`. Ensure every `{count}` / `{recipientCount}` span has `className="tabular-nums"`. (AudienceBar + ConfirmBroadcastDialog already do — verify nothing slipped through.)

- [ ] **Step 3: Keyboard niceties**

Confirm the primary Broadcast button gets a visible ring on keyboard focus (default shadcn ring should suffice, thanks to Task 1's `--ring`). In `BroadcastPage`, add `Cmd/Ctrl+Enter` inside the composer to open the confirm dialog:

```tsx
// Add inside BroadcastPage component, before return:
const handleKeyDown = (e: KeyboardEvent) => {
  const isCmdEnter = (e.metaKey || e.ctrlKey) && e.key === "Enter";
  if (isCmdEnter && !disabledReason && !broadcast.isPending) {
    e.preventDefault();
    setConfirmOpen(true);
  }
};

useEffect(() => {
  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}, [disabledReason, broadcast.isPending]);
```

Import `useEffect` from React. Update the hint line in the footer to include " · ⌘↵ to broadcast" when not disabled.

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter admin check-types
```

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src
git commit -m "polish(admin): emil-style details for broadcast redesign"
```

---

### Task 12: Final verification

**Files:** none (commands only)

- [ ] **Step 1: Typecheck everything**

```bash
pnpm -w check-types
```

Expected: passes.

- [ ] **Step 2: Lint**

```bash
pnpm --filter admin lint
```

Expected: passes. Fix any warnings introduced by new files.

- [ ] **Step 3: Build**

```bash
pnpm --filter admin build
```

Expected: passes. Admin Vite bundle emits to `apps/admin/dist/`.

- [ ] **Step 4: Commit any fix-ups**

```bash
git add -A
git commit -m "chore(admin): appease lint + typecheck after redesign"
```

(Skip if nothing changed.)

---

### Task 13: Manual UAT (walkthrough with user)

**Files:** none (interactive)

Per the user's QA rule, walk through UAT one step at a time using `AskUserQuestion`. Do **not** batch; confirm each step. The script is:

- [ ] **Step 1: Start dev servers**

From repo root:

```bash
pnpm dev
```

(Or the admin-specific command the user prefers — confirm first.)

- [ ] **Step 2: Ask user to verify the layout**

Ask via `AskUserQuestion`: "Open http://localhost:6820 and visit the broadcast page. Does the split layout render — composer left, dark Telegram preview right, footer bar with audience chip + Broadcast button?"

- [ ] **Step 3: Ask user to verify live preview**

"Type `Hello **world**` into the composer. Do you see a sage-tinted bubble in the right panel with the word 'world' bolded, and a note saying 'Approximate preview'?"

- [ ] **Step 4: Ask user to verify All-users flow**

"With the audience chip set to **All users**, click Broadcast. The confirm dialog should show the recipient count and a preview. **Cancel** — do not send yet."

- [ ] **Step 5: Ask user to verify Specific-users flow with search**

"Switch the audience to **Specific**. Type a fragment of your own username into the search. Does the list filter to matching users? Select yourself (and optionally others); the selected count should update and selected users should pin to the top of the list."

- [ ] **Step 6: Ask user to send a real test broadcast to themselves**

"With only yourself selected and a harmless test message (e.g., `UAT from admin redesign`), click Broadcast → Send. Did you receive the message on Telegram, and did a success toast appear with the sent count?"

- [ ] **Step 7: Ask user to simulate a failure**

"Temporarily add a bogus user ID by selecting a user you know has blocked the bot (or skip if N/A). Broadcast again. Does the toast show 'Sent to X, failed for Y' with a 'View failures' action that opens the failures dialog?"

(If no such user exists, mark this step as manually verified based on the code path and move on.)

- [ ] **Step 8: Ask user to verify keyboard shortcut**

"Focus the composer, type anything, and press ⌘↵ (macOS) or Ctrl↵. Does the confirm dialog open?"

- [ ] **Step 9: Wrap up**

If all steps pass, push the branch and open a PR per the user's PR flow (never commit direct to main; use `gh pr merge --auto --squash --delete-branch` once CI is green).

```bash
git push -u origin feat/admin-broadcast-redesign
gh pr create --base main --title "feat(admin): redesign broadcast dashboard with shadcn + live preview" --body "<generated>"
gh pr merge --auto --squash --delete-branch
```

If any step fails, capture the failure, fix in a new commit on this branch, and re-run the affected UAT step.

---

## Plan Self-Review Notes

- **Spec §2 layout:** Task 8 (BroadcastPage) + Task 5 (MessageComposer) + Task 4 (TelegramPreview) + Task 6 (AudienceBar) cover the two-column + sticky footer layout. Responsive `lg:grid-cols-[55fr_45fr]` collapses to stacked below `lg`.
- **Spec §3 components:** All nine files (page + seven feature components + toaster wiring) are created across Tasks 4–9.
- **Spec §4 data flow:** State model in Task 8's `BroadcastPage.tsx` matches the spec exactly (`message`, `targetMode`, `selectedUserIds`, `confirmOpen`, `failuresOpen`).
- **Spec §5 user search:** Task 6's `AudiencePopover` implements case-insensitive filter + pinning + clear.
- **Spec §6 preview rendering:** Task 4 uses `marked` + `isomorphic-dompurify`, renders bubbles split on blank lines, shows the "approximate" footnote.
- **Spec §7 error/feedback:** Task 7 (confirm dialog), Task 8 (toast flow), Task 11 (focus ring) cover confirm → sending spinner → success/warning toast → failures dialog.
- **Spec §8 Emil polish:** Task 11 covers motion, tabular-nums, keyboard focus. `--ring` token from Task 1 drives the sage focus ring.
- **Spec §9 testing:** Deviation called out at the top of this plan — automated tests deferred; manual UAT (Task 13) covers initial rollout.
- **Spec §10 incremental improvements:** Task 3 extracts `useUsers`; Task 10 deletes stale components + `testBroadcast` endpoint. Folder move into `components/broadcast/` is implicit in Task 4+ (new files created in the new folder; old file deleted).
- **Spec §11 implementation order:** Matches this plan's task order.
- **Placeholder scan:** No "TBD" / "TODO" / "fill in" strings introduced. Code blocks accompany every code step.
- **Type consistency:** `TargetMode` defined once in `AudiencePopover.tsx` and re-imported elsewhere. `AdminUser` + `BroadcastFailure` likewise single-sourced.
