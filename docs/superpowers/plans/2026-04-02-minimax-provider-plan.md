# Minimax Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Minimax provider support for the Mastra agent using `@ai-sdk/openai` alongside Google Gemini.

**Architecture:** A Provider Factory pattern will be used to resolve the correct AI model dynamically based on environment variables, decoupling `agent.ts` from hardcoded provider dependencies.

**Tech Stack:** Mastra, Vercel AI SDK (`@ai-sdk/google`, `@ai-sdk/openai`), Zod.

---

### Task 1: Add Dependencies and Update Configuration

**Files:**

- Modify: `packages/agent/package.json`
- Modify: `.env.example` (if it exists in root)
- Modify: `apps/bot/src/env.ts`

- [ ] **Step 1: Install `@ai-sdk/openai` in `packages/agent`**

  ```bash
  cd packages/agent
  pnpm add @ai-sdk/openai
  cd ../../
  ```

- [ ] **Step 2: Update `.env.example`**
      If `.env.example` exists in the root of the project, append the new environment variables to it:

  ```bash
  # Check if the file exists and update it
  if [ -f .env.example ]; then
    echo "" >> .env.example
    echo "# Agent Provider Config" >> .env.example
    echo "AGENT_PROVIDER=google # google | minimax" >> .env.example
    echo "MINIMAX_API_KEY=" >> .env.example
    echo "MINIMAX_BASE_URL=https://api.minimax.chat/v1" >> .env.example
  fi
  ```

- [ ] **Step 3: Update Bot Environment Schema**
      Modify `apps/bot/src/env.ts` to include the new optional variables in the schema.
      Find:

  ```typescript
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1),
    AGENT_MODEL: z.string().min(1).default("gemini-3.1-flash-lite-preview"),
  ```

  Replace with:

  ```typescript
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1),
    AGENT_MODEL: z.string().min(1).default("gemini-3.1-flash-lite-preview"),
    AGENT_PROVIDER: z.enum(["google", "minimax"]).default("google"),
    MINIMAX_API_KEY: z.string().optional(),
    MINIMAX_BASE_URL: z.string().default("https://api.minimax.chat/v1"),
  ```

- [ ] **Step 4: Commit**
  ```bash
  git add packages/agent/package.json pnpm-lock.yaml .env.example apps/bot/src/env.ts
  git commit -m "chore: add @ai-sdk/openai and update environment variables for minimax support"
  ```

---

### Task 2: Implement Provider Factory

**Files:**

- Create: `packages/agent/src/provider.ts`
- Create: `packages/agent/src/provider.test.ts`

- [ ] **Step 1: Write the failing test**
      Create `packages/agent/src/provider.test.ts` with the following content:

  ```typescript
  import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
  import { getAgentModel } from "./provider.js";
  import { google } from "@ai-sdk/google";

  // Mock the ai-sdk providers
  vi.mock("@ai-sdk/google", () => ({
    google: vi.fn((model) => `mocked-google-${model}`),
  }));

  vi.mock("@ai-sdk/openai", () => ({
    createOpenAI: vi.fn(() => vi.fn((model) => `mocked-openai-${model}`)),
  }));

  describe("getAgentModel", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      vi.clearAllMocks();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("should default to Google Gemini when AGENT_PROVIDER is missing", () => {
      delete process.env.AGENT_PROVIDER;
      process.env.AGENT_MODEL = "gemini-test";
      const model = getAgentModel();
      expect(model).toBe("mocked-google-gemini-test");
      expect(google).toHaveBeenCalledWith("gemini-test");
    });

    it("should use Minimax when AGENT_PROVIDER is 'minimax'", () => {
      process.env.AGENT_PROVIDER = "minimax";
      process.env.AGENT_MODEL = "minimax-test";
      process.env.MINIMAX_API_KEY = "test-key";
      process.env.MINIMAX_BASE_URL = "https://test.url";

      const model = getAgentModel();
      expect(model).toBe("mocked-openai-minimax-test");
      // Note: testing internal call arguments of the mocked createOpenAI is complex,
      // but verifying the result string confirms it took the minimax path.
    });

    it("should throw an error for unsupported provider", () => {
      process.env.AGENT_PROVIDER = "unsupported";
      expect(() => getAgentModel()).toThrow(
        "Unsupported AGENT_PROVIDER: unsupported"
      );
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**
      Run: `cd packages/agent && pnpm vitest run src/provider.test.ts`
      Expected: FAIL with "Cannot find module './provider.js'"

- [ ] **Step 3: Write minimal implementation**
      Create `packages/agent/src/provider.ts` with the following content:

  ```typescript
  import { google } from "@ai-sdk/google";
  import { createOpenAI } from "@ai-sdk/openai";
  import type { LanguageModel } from "ai";

  export function getAgentModel(): LanguageModel {
    const provider = process.env.AGENT_PROVIDER || "google";
    const modelName = process.env.AGENT_MODEL;

    if (provider === "google") {
      return google(modelName || "gemini-3.1-flash-lite-preview");
    }

    if (provider === "minimax") {
      if (!process.env.MINIMAX_API_KEY) {
        throw new Error(
          "MINIMAX_API_KEY is required when using minimax provider"
        );
      }
      const minimax = createOpenAI({
        name: "minimax",
        apiKey: process.env.MINIMAX_API_KEY,
        baseURL: process.env.MINIMAX_BASE_URL || "https://api.minimax.chat/v1",
      });
      return minimax(modelName || "abab6.5-chat");
    }

    throw new Error(`Unsupported AGENT_PROVIDER: ${provider}`);
  }
  ```

- [ ] **Step 4: Run test to verify it passes**
      Run: `cd packages/agent && pnpm vitest run src/provider.test.ts`
      Expected: PASS

- [ ] **Step 5: Export provider from agent package**
      Modify `packages/agent/src/index.ts` to optionally export the provider if needed, or simply let it be used internally. No changes needed to `index.ts` if only used internally. Let's skip modifying `index.ts`.

- [ ] **Step 6: Commit**
  ```bash
  git add packages/agent/src/provider.ts packages/agent/src/provider.test.ts
  git commit -m "feat: implement provider factory for ai models"
  ```

---

### Task 3: Integrate Factory into Agent

**Files:**

- Modify: `packages/agent/src/agent.ts`

- [ ] **Step 1: Update Agent Instantiation**
      In `packages/agent/src/agent.ts`:
  1. Remove `import { google } from "@ai-sdk/google";`
  2. Add `import { getAgentModel } from "./provider.js";`
  3. Replace `model: google(process.env.AGENT_MODEL || "gemini-3.1-flash-lite-preview"),` with `model: getAgentModel(),`

  _Note: Make sure to check that there are no other references to `google` in `agent.ts`._

- [ ] **Step 2: Typecheck & Build Project**
      Run the full build and typecheck to ensure everything compiles correctly.

  ```bash
  pnpm turbo run check-types
  pnpm turbo run build
  ```

- [ ] **Step 3: Run full test suite**

  ```bash
  pnpm vitest run packages/agent
  ```

  Expected: All tests pass.

- [ ] **Step 4: Commit**
  ```bash
  git add packages/agent/src/agent.ts
  git commit -m "feat: integrate provider factory into Mastra agent"
  ```
