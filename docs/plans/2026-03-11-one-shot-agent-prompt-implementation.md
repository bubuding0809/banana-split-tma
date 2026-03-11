# One-Shot Agent Prompt Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Provide a one-shot copy-paste prompt in the web UI when generating a new token, streamlining the Banana Split CLI setup for AI agents.

**Architecture:** We will update the `AccessTokensSection` React component to present a conversational prompt block within the success modal, using existing UI patterns (Copy button, syntax highlighting) and injecting the newly generated token.

**Tech Stack:** React, Tailwind CSS, `@telegram-apps/telegram-ui`

---

### Task 1: Update the Access Token Success Modal

**Files:**

- Modify: `apps/web/src/components/features/Settings/AccessTokensSection.tsx`

**Step 1: Extract the prompt template**
Add a helper constant near the top of the file (e.g. above `AccessTokensSection`):

```typescript
const getAgentPrompt = (
  token: string
) => `Hey agent, please install and configure the Banana Split CLI for this project:
1. Run \`npm install -g @banananasplitz/cli\`
2. Run \`banana login --api-key ${token}\`
3. Install the skill by evaluating \`banana install-skill\`, extracting the \`skill_path\` from the JSON, and copying that directory into your skills folder.
4. Confirm you can read the skill, then run \`banana list-expenses\` to verify the connection.`;
```

**Step 2: Update state for copying the prompt**
In `AccessTokensSection.tsx` inside the component, add state and a handler:

```typescript
const [copiedPrompt, setCopiedPrompt] = useState(false);

const handleCopyPrompt = useCallback(() => {
  if (newRawKey) {
    navigator.clipboard.writeText(getAgentPrompt(newRawKey));
    setCopiedPrompt(true);
    hapticFeedback.impactOccurred("light");
    setTimeout(() => setCopiedPrompt(false), 2000);
  }
}, [newRawKey]);
```

**Step 3: Update `handleCloseModal`**
Ensure we reset `copiedPrompt`:

```typescript
const handleCloseModal = useCallback(() => {
  setNewRawKey(null);
  setCopied(false);
  setCopiedPrompt(false);
}, []);
```

**Step 4: Update the Modal UI**
Update the `<Modal open={!!newRawKey}>` contents. Replace the existing token-only display with the prompt display, while keeping a small section for just the token.

```tsx
<div className="flex flex-col gap-4 px-4 pb-6 pt-2">
  <Text className="text-sm text-gray-500">
    Copy this setup prompt to your AI agent (Claude Code, OpenCode, Cursor, etc.). For security, the token won&apos;t be shown again.
  </Text>

  <div className="relative">
    <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border bg-gray-50 p-4 font-mono text-xs dark:bg-gray-800">
      {newRawKey ? getAgentPrompt(newRawKey) : ""}
    </pre>
  </div>

  <button
    onClick={handleCopyPrompt}
    className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-base font-semibold text-white transition-colors"
    style={{ backgroundColor: copiedPrompt ? "#22c55e" : tButtonColor }}
  >
    {copiedPrompt ? (
      <>
        <Check size={20} />
        Copied Prompt!
      </>
    ) : (
      <>
        <Copy size={20} />
        Copy Agent Setup Prompt
      </>
    )}
  </button>

  <div className="mt-2 flex flex-col gap-2 rounded-xl border border-gray-100 p-4 dark:border-gray-800">
    <Text className="text-xs font-medium text-gray-500">Or copy just the raw token:</Text>
    <code className="break-all rounded bg-gray-50 p-2 text-xs dark:bg-gray-900">
      {newRawKey}
    </code>
    <button
      onClick={handleCopy}
      className="mt-1 flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors"
      style={{
        backgroundColor: copied ? "#22c55e" : "transparent",
        color: copied ? "white" : tButtonColor,
        border: \`1px solid \${copied ? "#22c55e" : tButtonColor}\`,
      }}
    >
      {copied ? (
        <>
          <Check size={16} />
          Copied Token
        </>
      ) : (
        <>
          <Copy size={16} />
          Copy Token Only
        </>
      )}
    </button>
  </div>
</div>
```

**Step 5: Verify via TypeScript Check**
Run: `pnpm --filter web check-types`
Expected: PASS

**Step 6: Verify via Linter**
Run: `pnpm --filter web lint`
Expected: PASS

**Step 7: Commit**

```bash
git add apps/web/src/components/features/Settings/AccessTokensSection.tsx
git commit -m "feat(web): update access token modal with one-shot agent prompt"
```
