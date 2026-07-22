import { useCallback, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { backButton, hapticFeedback } from "@telegram-apps/sdk-react";
import { Cell, Section, Skeleton, Switch } from "@telegram-apps/telegram-ui";
import { Sparkles } from "lucide-react";
import { trpc } from "@/utils/trpc";
import IconSquare from "./IconSquare";

interface BotSettingsSubPageProps {
  chatId: number;
}

export default function BotSettingsSubPage({
  chatId,
}: BotSettingsSubPageProps) {
  const navigate = useNavigate();
  const trpcUtils = trpc.useUtils();
  const { data: chat, isPending } = trpc.chat.getChat.useQuery({ chatId });

  const updateChat = trpc.chat.updateChat.useMutation({
    onMutate: (input) => {
      trpcUtils.chat.getChat.setData({ chatId }, (prev) =>
        prev ? { ...prev, ...input } : prev
      );
    },
    onSuccess: () => trpcUtils.chat.getChat.invalidate({ chatId }),
    onError: () => trpcUtils.chat.getChat.invalidate({ chatId }),
  });

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

  const toggleAgent = useCallback(() => {
    const next = !(chat?.agentEnabled ?? false);
    updateChat.mutate(
      { chatId, agentEnabled: next },
      {
        onSuccess: () => hapticFeedback.notificationOccurred("success"),
        onError: () => hapticFeedback.notificationOccurred("error"),
      }
    );
  }, [chat, chatId, updateChat]);

  return (
    <main className="px-3 pb-8">
      <Section
        header="AI assistant"
        footer="Experimental. When on, the bot answers @mentions, replies, /ask and /do in this group. When off, it stays silent."
      >
        <Cell
          Component="label"
          before={
            <IconSquare color="indigo">
              <Sparkles size={14} />
            </IconSquare>
          }
          after={
            <Skeleton visible={isPending}>
              <Switch
                checked={chat?.agentEnabled ?? false}
                onChange={toggleAgent}
                disabled={isPending}
              />
            </Skeleton>
          }
        >
          AI assistant
        </Cell>
      </Section>
    </main>
  );
}
