import { hapticFeedback } from "@telegram-apps/sdk-react";
import { Button, Modal, Text, Title } from "@telegram-apps/telegram-ui";
import { Copy } from "lucide-react";
import { useCallback } from "react";

interface SetupGuideModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after each copy action so the parent can fire a snackbar. */
  onCopy?: (label: string) => void;
}

const OPENCLAW_CONFIG = `"mcp": {
  "banana-split": {
    "command": "node",
    "args": [
      "/path/to/banana-split-tma/apps/mcp/dist/index.js"
    ],
    "env": {
      "BANANA_SPLIT_API_KEY": "<YOUR_API_TOKEN>"
    }
  }
}`;

const CLAUDE_DESKTOP_CONFIG = `"mcpServers": {
  "banana-split": {
    "command": "node",
    "args": [
      "/path/to/banana-split-tma/apps/mcp/dist/index.js"
    ],
    "env": {
      "BANANA_SPLIT_API_KEY": "<YOUR_API_TOKEN>"
    }
  }
}`;

const AGENT_INSTRUCTIONS = `You are connected to the Banana Split MCP Server. You have access to tools to read and manage expenses for this Telegram group.

When interacting with expenses:
1. Always verify the currency of an expense or settlement.
2. If asked to summarize expenses, use the list tools to retrieve them first.
3. If asked to create an expense or settlement, use the corresponding write tools.
4. Keep track of who owes who by using the get_debts and get_simplified_debts tools.`;

export default function SetupGuideModal({
  open,
  onOpenChange,
  onCopy,
}: SetupGuideModalProps) {
  const copy = useCallback(
    (text: string, label: string) => {
      navigator.clipboard.writeText(text);
      hapticFeedback.impactOccurred("light");
      onCopy?.(label);
    },
    [onCopy]
  );

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <div className="flex h-[80vh] flex-col gap-6 overflow-y-auto px-4 pb-8 pt-4">
        <Title level="2" weight="2">
          MCP Setup Guide
        </Title>
        <Text className="text-(--tg-theme-subtitle-text-color) text-sm">
          Copy the configuration below into your AI agent&apos;s settings.
          Replace{" "}
          <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">
            &lt;YOUR_API_TOKEN&gt;
          </code>{" "}
          with a token generated above.
        </Text>

        <GuideSection
          title="OpenClaw"
          hint="Paste into your"
          hintCode="opencode.json"
          hintTail="file."
          code={OPENCLAW_CONFIG}
          onCopy={() => copy(OPENCLAW_CONFIG, "OpenClaw config copied")}
        />

        <GuideSection
          title="Claude Desktop"
          hint="Paste into your"
          hintCode="claude_desktop_config.json"
          hintTail="file."
          code={CLAUDE_DESKTOP_CONFIG}
          onCopy={() =>
            copy(CLAUDE_DESKTOP_CONFIG, "Claude Desktop config copied")
          }
        />

        <GuideSection
          title="Agent Instructions"
          hint="Paste these into your agent's system prompt or workspace context."
          code={AGENT_INSTRUCTIONS}
          onCopy={() => copy(AGENT_INSTRUCTIONS, "Agent instructions copied")}
          wrap
        />
      </div>
    </Modal>
  );
}

interface GuideSectionProps {
  title: string;
  hint: string;
  hintCode?: string;
  hintTail?: string;
  code: string;
  onCopy: () => void;
  /** Wrap long lines (e.g., for prose-heavy agent instructions). */
  wrap?: boolean;
}

function GuideSection({
  title,
  hint,
  hintCode,
  hintTail,
  code,
  onCopy,
  wrap,
}: GuideSectionProps) {
  return (
    <div className="flex flex-col gap-3">
      <Title level="3" weight="2">
        {title}
      </Title>
      <Text className="text-(--tg-theme-subtitle-text-color) text-sm">
        {hint}
        {hintCode ? (
          <>
            {" "}
            <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">
              {hintCode}
            </code>{" "}
            {hintTail}
          </>
        ) : null}
      </Text>
      <pre
        className={`overflow-x-auto rounded-lg border bg-gray-50 p-4 font-mono text-xs dark:bg-gray-800 ${
          wrap ? "whitespace-pre-wrap" : ""
        }`}
      >
        {code}
      </pre>
      <Button
        size="m"
        stretched
        mode="filled"
        onClick={onCopy}
        before={<Copy size={18} />}
      >
        Copy
      </Button>
    </div>
  );
}
