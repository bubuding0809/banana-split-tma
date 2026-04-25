import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  backButton,
  hapticFeedback,
  initData,
  useSignal,
} from "@telegram-apps/sdk-react";
import { ButtonCell, Section, Text } from "@telegram-apps/telegram-ui";
import { Plus } from "lucide-react";
import { trpc } from "@/utils/trpc";
import TokenNameSheet from "./TokenNameSheet";

interface DeveloperSubPageProps {
  chatId: number;
}

interface ListedToken {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
}

export default function DeveloperSubPage({ chatId }: DeveloperSubPageProps) {
  const navigate = useNavigate();
  const tUser = useSignal(initData.user);
  const isPrivate = (tUser?.id ?? 0) === chatId;
  const trpcUtils = trpc.useUtils();

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ListedToken | null>(null);
  const [newRawKey, setNewRawKey] = useState<string | null>(null);
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
            <div className="text-(--tg-theme-subtitle-text-color) text-xs">
              Created {new Date(t.createdAt).toLocaleDateString()} ·{" "}
              {t.keyPrefix}…
            </div>
          </button>
        ))}
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

      {/* Show the raw key once after creation. */}
      {newRawKey && (
        <RawKeyModal rawKey={newRawKey} onClose={() => setNewRawKey(null)} />
      )}
    </main>
  );
}

// Lifted from the existing AccessTokensSection's raw-key reveal modal — show
// once, allow copy, then dismiss. The original component already has this UX;
// when we remove the old file in Task 20 we keep this small modal here.
function RawKeyModal({
  rawKey,
  onClose,
}: {
  rawKey: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
      <div className="bg-(--tg-theme-bg-color) w-full rounded-t-2xl px-4 py-4">
        <div className="text-center text-base font-semibold">New token</div>
        <Text className="text-(--tg-theme-subtitle-text-color) mt-2 block">
          Copy this key now — you won't see it again.
        </Text>
        <pre className="mt-3 break-all rounded bg-gray-100 p-3 text-xs">
          {rawKey}
        </pre>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(rawKey);
            hapticFeedback.impactOccurred("light");
          }}
          className="mt-3 w-full rounded bg-blue-500 py-2 font-medium text-white"
        >
          Copy
        </button>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full rounded border py-2 font-medium"
        >
          Done
        </button>
      </div>
    </div>
  );
}
