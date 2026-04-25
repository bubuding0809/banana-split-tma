import {
  hapticFeedback,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import {
  ButtonCell,
  IconButton,
  Modal,
  Section,
  Title,
} from "@telegram-apps/telegram-ui";
import { Copy, X } from "lucide-react";
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
  const tSubtitleTextColor = useSignal(themeParams.subtitleTextColor);

  const copy = useCallback(
    (text: string, label: string) => {
      navigator.clipboard.writeText(text);
      hapticFeedback.impactOccurred("light");
      onCopy?.(label);
    },
    [onCopy]
  );

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      header={
        <Modal.Header
          before={
            <Title weight="2" level="3">
              MCP Setup Guide
            </Title>
          }
          after={
            <Modal.Close>
              <IconButton
                size="s"
                mode="gray"
                onClick={() => hapticFeedback.impactOccurred("light")}
              >
                <X
                  size={20}
                  strokeWidth={3}
                  style={{ color: tSubtitleTextColor }}
                />
              </IconButton>
            </Modal.Close>
          }
        />
      }
    >
      <div className="max-h-[75vh] overflow-y-auto pb-8">
        <Section
          className="px-3"
          header="OpenClaw"
          footer="Paste into your opencode.json file. Replace <YOUR_API_TOKEN> with a token generated above."
        >
          <CodeBlock>{OPENCLAW_CONFIG}</CodeBlock>
          <ButtonCell
            before={<Copy size={20} />}
            onClick={() => copy(OPENCLAW_CONFIG, "OpenClaw config copied")}
          >
            Copy config
          </ButtonCell>
        </Section>

        <Section
          className="px-3"
          header="Claude Desktop"
          footer="Paste into your claude_desktop_config.json file. Replace <YOUR_API_TOKEN> with a token generated above."
        >
          <CodeBlock>{CLAUDE_DESKTOP_CONFIG}</CodeBlock>
          <ButtonCell
            before={<Copy size={20} />}
            onClick={() =>
              copy(CLAUDE_DESKTOP_CONFIG, "Claude Desktop config copied")
            }
          >
            Copy config
          </ButtonCell>
        </Section>

        <Section
          className="px-3"
          header="Agent instructions"
          footer="Paste into your agent's system prompt or workspace context."
        >
          <CodeBlock wrap>{AGENT_INSTRUCTIONS}</CodeBlock>
          <ButtonCell
            before={<Copy size={20} />}
            onClick={() =>
              copy(AGENT_INSTRUCTIONS, "Agent instructions copied")
            }
          >
            Copy instructions
          </ButtonCell>
        </Section>
      </div>
    </Modal>
  );
}

interface CodeBlockProps {
  children: string;
  /** Wrap long lines for prose-heavy content. */
  wrap?: boolean;
}

function CodeBlock({ children, wrap }: CodeBlockProps) {
  return (
    <pre
      className={`bg-(--tg-theme-secondary-bg-color) border-(--tg-theme-section-separator-color) overflow-x-auto border-y px-4 py-3 font-mono text-xs ${
        wrap ? "whitespace-pre-wrap" : ""
      }`}
    >
      {children}
    </pre>
  );
}
