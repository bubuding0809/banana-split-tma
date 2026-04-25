import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  backButton,
  hapticFeedback,
  initData,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import {
  ButtonCell,
  Cell,
  IconButton,
  Modal,
  Section,
  Snackbar,
  Title,
} from "@telegram-apps/telegram-ui";
import { BookOpen, Copy, Plus, X } from "lucide-react";
import { trpc } from "@/utils/trpc";
import TokenNameSheet from "./TokenNameSheet";
import SetupGuideModal from "./SetupGuideModal";

interface DeveloperSubPageProps {
  chatId: number;
}

interface ListedToken {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
}

const getAgentPrompt = (
  token: string
) => `Hey agent, please install and configure the Banana Split CLI for this project:
1. Run \`npm install -g @banananasplitz/cli\`
2. Run \`banana login --api-key ${token}\`
3. Install the skill by evaluating \`banana install-skill\`, extracting the \`skill_path\` from the JSON, and copying that directory into your skills folder.
4. Confirm you can read the skill, then run \`banana list-expenses\` to verify the connection.`;

export default function DeveloperSubPage({ chatId }: DeveloperSubPageProps) {
  const navigate = useNavigate();
  const tUser = useSignal(initData.user);
  const tSubtitleTextColor = useSignal(themeParams.subtitleTextColor);
  const isPrivate = (tUser?.id ?? 0) === chatId;
  const trpcUtils = trpc.useUtils();

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ListedToken | null>(null);
  const [newRawKey, setNewRawKey] = useState<string | null>(null);
  const [setupGuideOpen, setSetupGuideOpen] = useState(false);
  const [snackbarText, setSnackbarText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Use the right query family for chat vs user. Both called unconditionally
  // (Rules of Hooks); enabled flag controls which actually fires.
  const chatTokensQ = trpc.apiKey.listTokens.useQuery(
    { chatId },
    { enabled: !isPrivate }
  );
  const userTokensQ = trpc.apiKey.listUserTokens.useQuery(undefined, {
    enabled: isPrivate,
  });
  const tokens: ListedToken[] = useMemo(() => {
    const raw = (isPrivate ? userTokensQ.data : chatTokensQ.data) ?? [];
    return raw.map((t) => ({
      id: t.id,
      name: t.name,
      keyPrefix: t.keyPrefix,
      createdAt: t.createdAt,
    }));
  }, [isPrivate, userTokensQ.data, chatTokensQ.data]);

  const generateChat = trpc.apiKey.generateToken.useMutation();
  const generateUser = trpc.apiKey.generateUserToken.useMutation();
  const renameChat = trpc.apiKey.renameToken.useMutation();
  const renameUser = trpc.apiKey.renameUserToken.useMutation();
  const revokeChat = trpc.apiKey.revokeToken.useMutation();
  const revokeUser = trpc.apiKey.revokeUserToken.useMutation();

  const invalidate = useCallback(
    () =>
      isPrivate
        ? trpcUtils.apiKey.listUserTokens.invalidate()
        : trpcUtils.apiKey.listTokens.invalidate({ chatId }),
    [isPrivate, chatId, trpcUtils]
  );

  useEffect(() => {
    backButton.show();
    return () => backButton.hide();
  }, []);
  useEffect(() => {
    const off = backButton.onClick(() => {
      hapticFeedback.notificationOccurred("success");
      navigate({
        to: "/chat/$chatId/settings",
        params: { chatId: String(chatId) },
      });
    });
    return () => off();
  }, [chatId, navigate]);

  const showSnackbar = useCallback((text: string) => {
    setSnackbarText(text);
  }, []);

  const copy = useCallback(
    (text: string, label: string) => {
      navigator.clipboard.writeText(text);
      hapticFeedback.impactOccurred("light");
      showSnackbar(label);
    },
    [showSnackbar]
  );

  const handleCreate = useCallback(
    async (name: string) => {
      setBusy(true);
      try {
        const result = isPrivate
          ? await generateUser.mutateAsync({ name })
          : await generateChat.mutateAsync({ chatId, name });
        setNewRawKey(result.rawKey);
        await invalidate();
        hapticFeedback.notificationOccurred("success");
      } catch (err) {
        console.error("Failed to create token:", err);
        hapticFeedback.notificationOccurred("error");
      } finally {
        setBusy(false);
      }
    },
    [chatId, isPrivate, generateChat, generateUser, invalidate]
  );

  const handleRename = useCallback(
    async (name: string) => {
      if (!editing) return;
      setBusy(true);
      try {
        if (isPrivate) {
          await renameUser.mutateAsync({ tokenId: editing.id, name });
        } else {
          await renameChat.mutateAsync({ chatId, tokenId: editing.id, name });
        }
        await invalidate();
        hapticFeedback.notificationOccurred("success");
      } catch (err) {
        console.error("Failed to rename token:", err);
        hapticFeedback.notificationOccurred("error");
      } finally {
        setBusy(false);
      }
    },
    [editing, isPrivate, chatId, renameChat, renameUser, invalidate]
  );

  const handleRevoke = useCallback(async () => {
    if (!editing) return;
    if (
      !confirm(
        "Revoke this token? Anything using it will lose access immediately."
      )
    )
      return;
    setBusy(true);
    try {
      if (isPrivate) {
        await revokeUser.mutateAsync({ tokenId: editing.id });
      } else {
        await revokeChat.mutateAsync({ chatId, tokenId: editing.id });
      }
      await invalidate();
      setEditing(null);
      hapticFeedback.notificationOccurred("success");
    } catch (err) {
      console.error("Failed to revoke token:", err);
      hapticFeedback.notificationOccurred("error");
    } finally {
      setBusy(false);
    }
  }, [editing, isPrivate, chatId, revokeChat, revokeUser, invalidate]);

  return (
    <main className="px-3 pb-8">
      <Section
        header="API access"
        footer="Tokens let the CLI and agents act on your behalf. Revoke anything you don't recognize."
      >
        <ButtonCell
          before={<Plus size={20} />}
          onClick={() => setCreateOpen(true)}
        >
          Generate new token
        </ButtonCell>

        {tokens.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setEditing(t)}
            className="block w-full px-3 py-2 text-left"
          >
            <div className="text-sm font-medium">{t.name}</div>
            <div className="text-xs" style={{ color: tSubtitleTextColor }}>
              Created {new Date(t.createdAt).toLocaleDateString()} ·{" "}
              {t.keyPrefix}…
            </div>
          </button>
        ))}
      </Section>

      <Section>
        <Cell
          before={<BookOpen size={20} />}
          onClick={() => {
            hapticFeedback.impactOccurred("light");
            setSetupGuideOpen(true);
          }}
        >
          MCP setup guide for agents
        </Cell>
      </Section>

      <TokenNameSheet
        mode="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={handleCreate}
        busy={busy}
      />
      <TokenNameSheet
        mode="edit"
        open={!!editing}
        initialName={editing?.name ?? ""}
        onOpenChange={(o) => !o && setEditing(null)}
        onSubmit={handleRename}
        onRevoke={handleRevoke}
        busy={busy}
      />

      {newRawKey && (
        <NewTokenModal
          rawKey={newRawKey}
          onClose={() => setNewRawKey(null)}
          onCopy={copy}
          onOpenSetupGuide={() => setSetupGuideOpen(true)}
        />
      )}

      <SetupGuideModal
        open={setupGuideOpen}
        onOpenChange={setSetupGuideOpen}
        onCopy={showSnackbar}
      />

      {snackbarText && (
        <Snackbar
          duration={3000}
          onClose={() => setSnackbarText(null)}
          description="Paste it where you need it."
        >
          {snackbarText}
        </Snackbar>
      )}
    </main>
  );
}

interface NewTokenModalProps {
  rawKey: string;
  onClose: () => void;
  onCopy: (text: string, label: string) => void;
  onOpenSetupGuide: () => void;
}

function NewTokenModal({
  rawKey,
  onClose,
  onCopy,
  onOpenSetupGuide,
}: NewTokenModalProps) {
  const tSubtitleTextColor = useSignal(themeParams.subtitleTextColor);
  const agentPrompt = getAgentPrompt(rawKey);

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      header={
        <Modal.Header
          before={
            <Title weight="2" level="3">
              New token
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
          header="Your token"
          footer="Copy this key now — you won't see it again."
        >
          <CodeBlock wrap>{rawKey}</CodeBlock>
          <ButtonCell
            before={<Copy size={20} />}
            onClick={() => onCopy(rawKey, "Token copied")}
          >
            Copy token
          </ButtonCell>
        </Section>

        <Section
          className="px-3"
          header="Set up an agent"
          footer="Paste this prompt into Claude, ChatGPT, or any coding agent — it installs the CLI and verifies the connection automatically."
        >
          <CodeBlock wrap>{agentPrompt}</CodeBlock>
          <ButtonCell
            before={<Copy size={20} />}
            onClick={() => onCopy(agentPrompt, "Agent setup prompt copied")}
          >
            Copy agent setup prompt
          </ButtonCell>
          <ButtonCell
            before={<BookOpen size={20} />}
            onClick={onOpenSetupGuide}
          >
            View MCP setup guide
          </ButtonCell>
        </Section>

        <Section className="px-3">
          <Cell onClick={onClose}>Done</Cell>
        </Section>
      </div>
    </Modal>
  );
}

function CodeBlock({ children, wrap }: { children: string; wrap?: boolean }) {
  const tSecondaryBackgroundColor = useSignal(
    themeParams.secondaryBackgroundColor
  );
  const tSectionSeparatorColor = useSignal(themeParams.sectionSeparatorColor);
  return (
    <pre
      className={`overflow-x-auto px-4 py-3 font-mono text-xs ${
        wrap ? "whitespace-pre-wrap break-all" : ""
      }`}
      style={{
        background: tSecondaryBackgroundColor,
        borderTop: `1px solid ${tSectionSeparatorColor ?? "transparent"}`,
        borderBottom: `1px solid ${tSectionSeparatorColor ?? "transparent"}`,
      }}
    >
      {children}
    </pre>
  );
}
