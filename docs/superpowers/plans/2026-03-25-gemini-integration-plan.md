# Telegram Agent Layer - Gemini Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current OpenAI provider in the Mastra agent with Google's Gemini (`gemini-3.1-flash-image-preview`).

**Architecture:** We will swap out the Vercel AI SDK provider in `packages/agent`, leveraging the SDK's built-in abstraction to minimize code changes. We will also update all relevant environment variables and `.env.example` to point to `GOOGLE_GENERATIVE_AI_API_KEY`.

**Tech Stack:** Mastra, Vercel AI SDK (`@ai-sdk/google`).

---

### Task 1: Update Agent Provider

**Files:**

- Modify: `packages/agent/package.json`
- Modify: `packages/agent/src/agent.ts`

- [ ] **Step 1: Swap dependencies**
      Remove `@ai-sdk/openai` and install `@ai-sdk/google` inside `packages/agent`.
      Command: `pnpm --filter @repo/agent remove @ai-sdk/openai && pnpm --filter @repo/agent add @ai-sdk/google`

- [ ] **Step 2: Update agent instantiation**
      In `packages/agent/src/agent.ts`, change the import from `import { openai } from "@ai-sdk/openai"` to `import { google } from "@ai-sdk/google"`.
      Change the model definition from `model: openai("gpt-4o")` to `model: google("gemini-3.1-flash-image-preview")`.

- [ ] **Step 3: Run build**
      Run `pnpm check-types --filter @repo/agent` and ensure it passes successfully.

- [ ] **Step 4: Commit**

```bash
git add packages/agent
git commit -m "feat: migrate agent model from OpenAI to Gemini"
```

---

### Task 2: Update Environment Variables

**Files:**

- Modify: `apps/bot/src/env.ts`
- Modify: `.envrc.example` (Root)

- [ ] **Step 1: Update Bot environment validation**
      In `apps/bot/src/env.ts`, update the `server` validation object. Add `GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1)` to ensure the bot fails fast if the Gemini API key is missing. Remove `OPENAI_API_KEY` if it was added previously (it doesn't look like it was strictly required before, so just ensure Google is required now).

- [ ] **Step 2: Update Root template**
      In the root `.envrc.example`, append `# Gemini Agent\nexport GOOGLE_GENERATIVE_AI_API_KEY="your_google_api_key_here"` to the bottom of the file to document the new requirement for developers.

- [ ] **Step 3: Run Types/Tests**
      Run `pnpm check-types --filter bot` and `pnpm test --filter @repo/agent` to ensure everything is stable.

- [ ] **Step 4: Commit**

```bash
git add apps/bot/src/env.ts .envrc.example
git commit -m "chore: update environment templates and validation for Gemini"
```
