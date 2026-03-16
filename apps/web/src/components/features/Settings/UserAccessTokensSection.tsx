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

const UserAccessTokensSection = () => {
  const [newRawKey, setNewRawKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const tDestructiveTextColor = useSignal(themeParams.destructiveTextColor);
  const tSubtitleTextColor = useSignal(themeParams.subtitleTextColor);
  const tButtonColor = useSignal(themeParams.buttonColor);

  const trpcUtils = trpc.useUtils();

  const { data: tokens, status: tokensStatus } =
    trpc.apiKey.listUserTokens.useQuery();

  const generateMutation = trpc.apiKey.generateUserToken.useMutation({
    onSuccess: (data) => {
      setNewRawKey(data.rawKey);
      trpcUtils.apiKey.listUserTokens.invalidate();
      hapticFeedback.notificationOccurred("success");
    },
    onError: () => {
      hapticFeedback.notificationOccurred("error");
    },
  });

  const revokeMutation = trpc.apiKey.revokeUserToken.useMutation({
    onSuccess: () => {
      trpcUtils.apiKey.listUserTokens.invalidate();
      hapticFeedback.notificationOccurred("success");
    },
    onError: () => {
      hapticFeedback.notificationOccurred("error");
    },
  });

  const handleGenerate = useCallback(() => {
    generateMutation.mutate();
  }, [generateMutation]);

  const handleCopy = useCallback(() => {
    if (newRawKey) {
      navigator.clipboard.writeText(newRawKey);
      setCopied(true);
      hapticFeedback.impactOccurred("light");
      setTimeout(() => setCopied(false), 2000);
    }
  }, [newRawKey]);

  const handleRevoke = useCallback(
    (tokenId: string) => {
      if (
        confirm(
          "Are you sure you want to revoke this API key? Any integration using it will immediately lose access."
        )
      ) {
        revokeMutation.mutate({ tokenId });
      }
    },
    [revokeMutation]
  );

  const handleCloseModal = useCallback(() => {
    setNewRawKey(null);
    setCopied(false);
  }, []);

  return (
    <>
      <Section
        header="Personal API Keys"
        footer="Generate API keys to allow personal AI agents to access your data."
      >
        <Skeleton visible={tokensStatus === "pending"}>
          {tokens?.length === 0 ? (
            <Cell>
              <Text className="text-sm italic text-gray-500">
                No active personal API keys
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
                    Created: {new Date(token.createdAt).toLocaleDateString()}
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
              : "Generate New API Key"}
          </ButtonCell>
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
                New API Key
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
            For security, this API key will not be shown again. Please copy it
            now.
          </Text>

          <div className="mt-2 flex flex-col gap-2 rounded-xl border border-gray-100 p-4 dark:border-gray-800">
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
              {copied ? "Copied Key" : "Copy API Key"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default UserAccessTokensSection;
