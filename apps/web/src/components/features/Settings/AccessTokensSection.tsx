import { trpc } from "@/utils/trpc";
import {
  hapticFeedback,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import {
  Button,
  ButtonCell,
  Cell,
  IconButton,
  Modal,
  Section,
  Skeleton,
  Text,
  Title,
} from "@telegram-apps/telegram-ui";
import { Copy, Check, Key, Plus, Trash2, X } from "lucide-react";
import { useState, useCallback } from "react";

const getAgentPrompt = (
  token: string
) => `Hey agent, please install and configure the Banana Split CLI for this project:
1. Run \`npm install -g @banananasplitz/cli\`
2. Run \`banana login --api-key ${token}\`
3. Install the skill by evaluating \`banana install-skill\`, extracting the \`skill_path\` from the JSON, and copying that directory into your skills folder.
4. Confirm you can read the skill, then run \`banana list-expenses\` to verify the connection.`;

interface AccessTokensSectionProps {
  chatId: number;
}

const AccessTokensSection = ({ chatId }: AccessTokensSectionProps) => {
  const [newRawKey, setNewRawKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [isSetupGuideOpen, setIsSetupGuideOpen] = useState(false);
  const [copiedAgent, setCopiedAgent] = useState<string | null>(null);

  const handleCopyAgentConfig = useCallback(
    (config: string, agentName: string) => {
      navigator.clipboard.writeText(config);
      setCopiedAgent(agentName);
      hapticFeedback.impactOccurred("light");
      setTimeout(() => setCopiedAgent(null), 2000);
    },
    []
  );

  const tDestructiveTextColor = useSignal(themeParams.destructiveTextColor);
  const tSubtitleTextColor = useSignal(themeParams.subtitleTextColor);
  const tButtonColor = useSignal(themeParams.buttonColor);

  const trpcUtils = trpc.useUtils();

  const { data: tokens, status: tokensStatus } =
    trpc.apiKey.listTokens.useQuery({ chatId });

  const generateMutation = trpc.apiKey.generateToken.useMutation({
    onSuccess: (data) => {
      setNewRawKey(data.rawKey);
      trpcUtils.apiKey.listTokens.invalidate({ chatId });
      hapticFeedback.notificationOccurred("success");
    },
    onError: () => {
      hapticFeedback.notificationOccurred("error");
    },
  });

  const revokeMutation = trpc.apiKey.revokeToken.useMutation({
    onSuccess: () => {
      trpcUtils.apiKey.listTokens.invalidate({ chatId });
      hapticFeedback.notificationOccurred("success");
    },
    onError: () => {
      hapticFeedback.notificationOccurred("error");
    },
  });

  const handleGenerate = useCallback(() => {
    generateMutation.mutate({ chatId });
  }, [chatId, generateMutation]);

  const handleCopy = useCallback(() => {
    if (newRawKey) {
      navigator.clipboard.writeText(newRawKey);
      setCopied(true);
      hapticFeedback.impactOccurred("light");
      setTimeout(() => setCopied(false), 2000);
    }
  }, [newRawKey]);

  const handleCopyPrompt = useCallback(() => {
    if (newRawKey) {
      navigator.clipboard.writeText(getAgentPrompt(newRawKey));
      setCopiedPrompt(true);
      hapticFeedback.impactOccurred("light");
      setTimeout(() => setCopiedPrompt(false), 2000);
    }
  }, [newRawKey]);

  const handleRevoke = useCallback(
    (tokenId: string) => {
      if (
        confirm(
          "Are you sure you want to revoke this token? Any agent using it will immediately lose access."
        )
      ) {
        revokeMutation.mutate({ chatId, tokenId });
      }
    },
    [chatId, revokeMutation]
  );

  const handleCloseModal = useCallback(() => {
    setNewRawKey(null);
    setCopied(false);
    setCopiedPrompt(false);
  }, []);

  return (
    <>
      <Section
        header="Access Tokens"
        footer="Generate tokens to allow AI agents (like the Banana Split MCP server) to access this group's expenses."
      >
        <Skeleton visible={tokensStatus === "pending"}>
          {tokens?.length === 0 ? (
            <Cell>
              <Text className="text-sm italic text-gray-500">
                No active tokens
              </Text>
            </Cell>
          ) : (
            tokens?.map((token) => (
              <Cell
                key={token.id}
                before={<Key size={18} className="text-gray-500" />}
                after={
                  <IconButton
                    size="s"
                    mode="plain"
                    onClick={() => handleRevoke(token.id)}
                    disabled={revokeMutation.isPending}
                  >
                    <Trash2
                      size={18}
                      style={{ color: tDestructiveTextColor }}
                    />
                  </IconButton>
                }
                subtitle={
                  <Text className="text-xs text-gray-500">
                    by {token.createdBy.firstName} ·{" "}
                    {new Date(token.createdAt).toLocaleDateString()}
                  </Text>
                }
              >
                <span className="font-mono text-sm">
                  {token.keyPrefix}
                  {"••••••••"}
                </span>
              </Cell>
            ))
          )}
        </Skeleton>

        <div className="flex flex-col gap-2">
          <ButtonCell
            before={<Plus size={20} />}
            onClick={handleGenerate}
            disabled={generateMutation.isPending}
          >
            {generateMutation.isPending
              ? "Generating..."
              : "Generate New Token"}
          </ButtonCell>

          {/* TODO: Review and enable MCP Setup Guide later
          <ButtonCell
            before={<BookOpen size={20} />}
            onClick={() => setIsSetupGuideOpen(true)}
            className="text-gray-500"
          >
            View MCP Setup Guide
          </ButtonCell>
          */}
        </div>
      </Section>

      <Modal
        open={!!newRawKey}
        onOpenChange={(open) => {
          if (!open) handleCloseModal();
        }}
        header={
          <Modal.Header
            before={
              <Title level="3" weight="1">
                New Access Token
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
        <div className="flex flex-col gap-4 px-4 pb-6 pt-2">
          <Text className="text-sm text-gray-500">
            Copy this setup prompt to your AI agent (Claude Code, OpenCode,
            Cursor, etc.). For security, the token won&apos;t be shown again.
          </Text>

          <div className="relative">
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border bg-gray-50 p-4 font-mono text-xs dark:bg-gray-800">
              {newRawKey ? getAgentPrompt(newRawKey) : ""}
            </pre>
          </div>

          <Button
            size="l"
            stretched
            mode="filled"
            onClick={handleCopyPrompt}
            before={copiedPrompt ? <Check size={20} /> : <Copy size={20} />}
            style={{ backgroundColor: copiedPrompt ? "#22c55e" : tButtonColor }}
          >
            {copiedPrompt ? "Copied Prompt!" : "Copy Agent Setup Prompt"}
          </Button>

          <div className="mt-2 flex flex-col gap-2 rounded-xl border border-gray-100 p-4 dark:border-gray-800">
            <Text className="text-xs font-medium text-gray-500">
              Or copy just the raw token:
            </Text>
            <code className="break-all rounded bg-gray-50 p-2 text-xs dark:bg-gray-900">
              {newRawKey}
            </code>
            <Button
              size="s"
              stretched
              mode={copied ? "filled" : "outline"}
              onClick={handleCopy}
              before={copied ? <Check size={16} /> : <Copy size={16} />}
              style={
                copied
                  ? {
                      backgroundColor: "#22c55e",
                      borderColor: "#22c55e",
                      color: "white",
                    }
                  : { color: tButtonColor, borderColor: tButtonColor }
              }
            >
              {copied ? "Copied Token" : "Copy Token Only"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={isSetupGuideOpen}
        onOpenChange={(open) => setIsSetupGuideOpen(open)}
        header={
          <Modal.Header
            before={
              <Title level="3" weight="1">
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
        <div className="flex h-[80vh] flex-col gap-6 overflow-y-auto px-4 pb-8 pt-2">
          <Text className="text-sm text-gray-500">
            Copy the configuration below into your AI agent&apos;s settings.
            Remember to replace{" "}
            <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">
              &lt;YOUR_API_TOKEN&gt;
            </code>{" "}
            with a token generated above.
          </Text>

          {/* OpenClaw Section */}
          <div className="flex flex-col gap-3">
            <Title level="3" weight="2">
              OpenClaw
            </Title>
            <Text className="text-sm text-gray-500">
              Paste this into your{" "}
              <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">
                opencode.json
              </code>{" "}
              file.
            </Text>
            <div className="relative">
              <pre className="overflow-x-auto rounded-lg border bg-gray-50 p-4 font-mono text-xs dark:bg-gray-800">
                {`"mcp": {
  "banana-split": {
    "command": "node",
    "args": [
      "/path/to/banana-split-tma/apps/mcp/dist/index.js"
    ],
    "env": {
      "BANANA_SPLIT_API_KEY": "<YOUR_API_TOKEN>"
    }
  }
}`}
              </pre>
              <Button
                size="m"
                stretched
                mode="filled"
                onClick={() =>
                  handleCopyAgentConfig(
                    `"mcp": {\n  "banana-split": {\n    "command": "node",\n    "args": [\n      "/path/to/banana-split-tma/apps/mcp/dist/index.js"\n    ],\n    "env": {\n      "BANANA_SPLIT_API_KEY": "<YOUR_API_TOKEN>"\n    }\n  }\n}`,
                    "openclaw"
                  )
                }
                before={
                  copiedAgent === "openclaw" ? (
                    <Check size={18} />
                  ) : (
                    <Copy size={18} />
                  )
                }
                style={{
                  backgroundColor:
                    copiedAgent === "openclaw" ? "#22c55e" : tButtonColor,
                }}
              >
                {copiedAgent === "openclaw" ? "Copied!" : "Copy Config"}
              </Button>
            </div>
          </div>

          {/* Claude Desktop Section */}
          <div className="flex flex-col gap-3">
            <Title level="3" weight="2">
              Claude Desktop
            </Title>
            <Text className="text-sm text-gray-500">
              Paste this into your{" "}
              <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">
                claude_desktop_config.json
              </code>{" "}
              file.
            </Text>
            <div className="relative">
              <pre className="overflow-x-auto rounded-lg border bg-gray-50 p-4 font-mono text-xs dark:bg-gray-800">
                {`"mcpServers": {
  "banana-split": {
    "command": "node",
    "args": [
      "/path/to/banana-split-tma/apps/mcp/dist/index.js"
    ],
    "env": {
      "BANANA_SPLIT_API_KEY": "<YOUR_API_TOKEN>"
    }
  }
}`}
              </pre>
              <Button
                size="m"
                stretched
                mode="filled"
                onClick={() =>
                  handleCopyAgentConfig(
                    `"mcpServers": {\n  "banana-split": {\n    "command": "node",\n    "args": [\n      "/path/to/banana-split-tma/apps/mcp/dist/index.js"\n    ],\n    "env": {\n      "BANANA_SPLIT_API_KEY": "<YOUR_API_TOKEN>"\n    }\n  }\n}`,
                    "claude"
                  )
                }
                before={
                  copiedAgent === "claude" ? (
                    <Check size={18} />
                  ) : (
                    <Copy size={18} />
                  )
                }
                style={{
                  backgroundColor:
                    copiedAgent === "claude" ? "#22c55e" : tButtonColor,
                }}
              >
                {copiedAgent === "claude" ? "Copied!" : "Copy Config"}
              </Button>
            </div>
          </div>

          {/* Agent Instructions Section */}
          <div className="flex flex-col gap-3">
            <Title level="3" weight="2">
              Agent Instructions
            </Title>
            <Text className="text-sm text-gray-500">
              Paste these custom instructions into your agent&apos;s system
              prompt or workspace context to help it use the MCP server
              effectively.
            </Text>
            <div className="relative">
              <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border bg-gray-50 p-4 font-mono text-xs dark:bg-gray-800">
                {`You are connected to the Banana Split MCP Server. You have access to tools to read and manage expenses for this Telegram group.

When interacting with expenses:
1. Always verify the currency of an expense or settlement.
2. If asked to summarize expenses, use the list tools to retrieve them first.
3. If asked to create an expense or settlement, use the corresponding write tools.
4. Keep track of who owes who by using the get_debts and get_simplified_debts tools.`}
              </pre>
              <Button
                size="m"
                stretched
                mode="filled"
                onClick={() =>
                  handleCopyAgentConfig(
                    `You are connected to the Banana Split MCP Server. You have access to tools to read and manage expenses for this Telegram group.\n\nWhen interacting with expenses:\n1. Always verify the currency of an expense or settlement.\n2. If asked to summarize expenses, use the list tools to retrieve them first.\n3. If asked to create an expense or settlement, use the corresponding write tools.\n4. Keep track of who owes who by using the get_debts and get_simplified_debts tools.`,
                    "instructions"
                  )
                }
                before={
                  copiedAgent === "instructions" ? (
                    <Check size={18} />
                  ) : (
                    <Copy size={18} />
                  )
                }
                style={{
                  backgroundColor:
                    copiedAgent === "instructions" ? "#22c55e" : tButtonColor,
                }}
              >
                {copiedAgent === "instructions"
                  ? "Copied!"
                  : "Copy Instructions"}
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default AccessTokensSection;
