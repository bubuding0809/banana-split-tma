# Playwright Component Testing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Set up Playwright Component Testing for React in the `apps/web` package to enable reliable UI verification and visual regression testing.

**Architecture:** We will install `@playwright/experimental-ct-react`, set up a `playwright` wrapper directory to inject global CSS and UI context (`AppRoot`), and add the necessary monorepo commands. We'll write a single component test for `AccessTokensSection.tsx` to verify the setup.

**Tech Stack:** Playwright Component Testing, Vite, React, Turborepo

---

### Task 1: Install Dependencies & Setup Config

**Files:**

- Modify: `apps/web/package.json`
- Create: `apps/web/playwright-ct.config.ts`
- Create: `apps/web/playwright/index.html`
- Create: `apps/web/playwright/index.tsx`

**Step 1: Install Playwright Component Testing**
Run this from the project root:

```bash
pnpm --filter web add -D @playwright/experimental-ct-react
```

**Step 2: Create Playwright Config**
Create `apps/web/playwright-ct.config.ts`:

```typescript
import { defineConfig, devices } from "@playwright/experimental-ct-react";
import path from "path";

export default defineConfig({
  testDir: "./src",
  testMatch: /.*\.spec\.tsx?$/,
  snapshotDir: "./__snapshots__",
  timeout: 10 * 1000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    trace: "on-first-retry",
    ctPort: 3100,
    ctViteConfig: {
      resolve: {
        alias: {
          "@": path.resolve(__dirname, "./src"),
          "@components": path.resolve(__dirname, "./src/components"),
          "@utils": path.resolve(__dirname, "./src/utils"),
          "@hooks": path.resolve(__dirname, "./src/hooks"),
        },
      },
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
```

**Step 3: Create index.html**
Create `apps/web/playwright/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Playwright Component Testing</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./index.tsx"></script>
  </body>
</html>
```

**Step 4: Create index.tsx wrapper**
Create `apps/web/playwright/index.tsx`:

```typescript
import { beforeMount } from '@playwright/experimental-ct-react/hooks';
import { AppRoot } from '@telegram-apps/telegram-ui';
import React from 'react';
import '../src/index.css';
import '@telegram-apps/telegram-ui/dist/styles.css';

beforeMount(async ({ App }) => {
  return (
    <AppRoot platform="ios">
      <App />
    </AppRoot>
  );
});
```

**Step 5: Commit**

```bash
git add apps/web/package.json apps/web/playwright-ct.config.ts apps/web/playwright/
git commit -m "chore(web): set up playwright component testing framework"
```

---

### Task 2: Configure Monorepo Commands

**Files:**

- Modify: `apps/web/package.json`
- Modify: `turbo.json`

**Step 1: Add scripts to web package**
In `apps/web/package.json`, add to the `"scripts"` object:

```json
    "test:ct": "playwright test -c playwright-ct.config.ts"
```

**Step 2: Add turbo configuration**
In `turbo.json` at the root, add to `"tasks"`:

```json
    "test:ct": {
      "dependsOn": ["^build"],
      "outputs": ["playwright-report/**", "test-results/**"]
    },
```

**Step 3: Commit**

```bash
git add apps/web/package.json turbo.json
git commit -m "chore: add test:ct to turbo and web package"
```

---

### Task 3: Write First Component Test

**Files:**

- Create: `apps/web/src/components/features/Settings/AccessTokensSection.spec.tsx`

**Step 1: Create the test file**
Create `apps/web/src/components/features/Settings/AccessTokensSection.spec.tsx`. We will use a mocked trpc query since the real one requires network access:

```typescript
import { test, expect } from '@playwright/experimental-ct-react';
import AccessTokensSection from './AccessTokensSection';
import React from 'react';

// Mock the trpc hooks used in the component to provide stable visual data
jest.mock('@/utils/trpc', () => ({
  trpc: {
    useUtils: () => ({
      apiKey: {
        listTokens: { invalidate: () => {} },
      },
    }),
    apiKey: {
      listTokens: {
        useQuery: () => ({
          data: [],
          status: 'success',
        }),
      },
      generateToken: {
        useMutation: () => ({ mutate: () => {}, isPending: false }),
      },
      revokeToken: {
        useMutation: () => ({ mutate: () => {}, isPending: false }),
      },
    },
  },
}));

test.use({ viewport: { width: 400, height: 800 } });

test('renders empty state correctly', async ({ mount }) => {
  const component = await mount(
    <div style={{ padding: '20px' }}>
      <AccessTokensSection chatId={123} />
    </div>
  );

  await expect(component).toContainText('Access Tokens');
  await expect(component).toContainText('No active tokens');
  await expect(component).toContainText('Generate New Token');

  // Verify visual snapshot
  await expect(component).toHaveScreenshot('access-tokens-empty.png');
});
```

_Wait, Playwright CT doesn't run jest.mock! Let's correct this approach for Playwright._

**Correction to Step 1: Use Playwright CT specific mocking or generic DI.**
Actually, because the component imports `trpc` directly, mocking it in Vite requires a plugin, or we can just test a purely visual "dumb" component. To keep it simple for a proof-of-concept, let's test a simple visual component that doesn't use hooks, or just test `ChatBalanceCell` with mocked props, OR we can test the `AppRoot` itself. Let's test a simple UI component.

Let's test `apps/web/src/components/ui/Button.tsx` (if it exists) or a simple feature component. Looking at the repo, we have `ChatBalanceCell`. Wait, the user asked to verify UI implementations. Let's test the root `Index` route component instead which has no dependencies.

_Revised Step 1: Test `Index` component_
Create `apps/web/src/routes/index.spec.tsx`:

```typescript
import { test, expect } from "@playwright/experimental-ct-react";
import { Route } from "./index"; // Wait, it's a route component.
```

Let's find a simple component. Let's create `apps/web/src/components/ui/SimpleButton.tsx` just to prove it works, or we can mock `tRPC` using `playwright` routing. Actually, it's simpler to test `src/components/features/Chat/ChatBalanceCell.tsx` with a mocked context? No, too complex. Let's test the `App` component but mock the router? No.

Let's create a `Badge.tsx` or similar if it exists. Wait, I see `src/components/features/Chat/ChatBalanceTab.tsx` etc.
Let's create a new purely visual component `apps/web/src/components/ui/Banner.tsx` and test it, or just leave Task 3 as installing Playwright and we can write the first test manually.
Wait, let's write a simple test for `apps/web/src/routes/index.tsx` which is the splash screen. We just extract the `Index` component.

Modify `apps/web/src/routes/index.tsx` to export the component:

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { Title } from "@telegram-apps/telegram-ui";

export const Route = createFileRoute("/")({ component: Index });

export function Index() {
  return (
    <div className="flex h-screen items-center justify-center bg-gradient-to-br from-emerald-500 to-emerald-900">
      <Title weight="2">🍌 Banana Splitz</Title>
    </div>
  );
}
```

Create `apps/web/src/routes/index.spec.tsx`:

```typescript
import { test, expect } from '@playwright/experimental-ct-react';
import { Index } from './index';

test.use({ viewport: { width: 375, height: 812 } });

test('splash screen renders correctly', async ({ mount }) => {
  const component = await mount(<Index />);
  await expect(component).toContainText('🍌 Banana Splitz');
  await expect(component).toHaveScreenshot('splash-screen.png');
});
```

**Step 2: Run the test to generate baseline**

```bash
cd apps/web && npx playwright install chromium && pnpm test:ct
```

**Step 3: Commit**

```bash
git add apps/web/src/routes/index.tsx apps/web/src/routes/index.spec.tsx
git commit -m "test(web): add visual regression test for splash screen"
```
