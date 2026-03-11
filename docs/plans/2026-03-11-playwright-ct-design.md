# 2026-03-11 Playwright Component Testing Design

## Context

The goal is to provide a way to easily render isolated React components and grab screenshots or perform visual regression testing to verify UI implementations.

## Design

### Tool Selection

We will use `@playwright/experimental-ct-react`. It is fast, integrates directly with our existing Vite toolchain, and handles taking and diffing screenshots automatically.

### Architecture

1. **Dependency Placement:** `@playwright/experimental-ct-react` will be installed as a `devDependency` within the `apps/web` package.
2. **Configuration File:** A `playwright-ct.config.ts` will be placed in `apps/web/`. It will be configured to point to the `playwright` directory for its global setup.
3. **Global Wrapper Setup:** Inside `apps/web/playwright/index.tsx`, we will load:
   - Our global Tailwind CSS (`../src/index.css`)
   - Telegram UI CSS (`@telegram-apps/telegram-ui/dist/styles.css`)
   - We will wrap tested components dynamically or globally in `<AppRoot platform="ios">` to ensure accurate rendering.
4. **Mocking Dependencies:** To take stable screenshots, components making API calls (e.g. `trpc`) must be mocked so they don't depend on network conditions.
5. **Turbo Configuration:** Expose `test:ct` as a script in `apps/web` and configure it in the root `turbo.json` to allow running tests across the monorepo.

### Test Structure

Tests will live alongside components using the `.spec.tsx` extension.

Example structure for a sample component:

```typescript
import { test, expect } from '@playwright/experimental-ct-react';
import AccessTokensSection from './AccessTokensSection';

test.use({ viewport: { width: 500, height: 800 } });

test('renders correctly', async ({ mount }) => {
  const component = await mount(<AccessTokensSection chatId={123} />);
  await expect(component).toHaveScreenshot('access-tokens.png');
});
```
