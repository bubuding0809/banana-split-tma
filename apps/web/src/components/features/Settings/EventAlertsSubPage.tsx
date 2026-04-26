import { useCallback, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { backButton, hapticFeedback } from "@telegram-apps/sdk-react";
import { Cell, Section, Switch } from "@telegram-apps/telegram-ui";
import { Bell, BellOff, BellRing } from "lucide-react";
import { trpc } from "@/utils/trpc";
import IconSquare from "./IconSquare";

interface EventAlertsSubPageProps {
  chatId: number;
}

type NotifyKey =
  | "notifyOnExpense"
  | "notifyOnExpenseUpdate"
  | "notifyOnSettlement";
type NotifyPatch = Partial<Record<NotifyKey, boolean>>;

export default function EventAlertsSubPage({
  chatId,
}: EventAlertsSubPageProps) {
  const navigate = useNavigate();
  const trpcUtils = trpc.useUtils();
  const { data: chat } = trpc.chat.getChat.useQuery({ chatId });

  const updateChat = trpc.chat.updateChat.useMutation({
    onMutate: (input) => {
      trpcUtils.chat.getChat.setData({ chatId }, (prev) =>
        prev ? { ...prev, ...input } : prev
      );
    },
    onSuccess: () => trpcUtils.chat.getChat.invalidate({ chatId }),
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

  const toggle = useCallback(
    (key: NotifyKey) => {
      const next = !(chat?.[key] ?? true);
      const patch: NotifyPatch = { [key]: next };
      updateChat.mutate(
        { chatId, ...patch },
        {
          onSuccess: () => hapticFeedback.notificationOccurred("success"),
          onError: () => hapticFeedback.notificationOccurred("error"),
        }
      );
    },
    [chat, chatId, updateChat]
  );

  return (
    <main className="px-3 pb-8">
      <Section
        header="Notify the group when…"
        footer="Reminders you send manually are unaffected by these settings."
      >
        <Cell
          Component="label"
          before={
            <IconSquare color="orange">
              <BellRing size={14} />
            </IconSquare>
          }
          after={
            <Switch
              checked={chat?.notifyOnExpense ?? true}
              onChange={() => toggle("notifyOnExpense")}
            />
          }
        >
          Expense added
        </Cell>
        <Cell
          Component="label"
          before={
            <IconSquare color="orange">
              <Bell size={14} />
            </IconSquare>
          }
          after={
            <Switch
              checked={chat?.notifyOnExpenseUpdate ?? true}
              onChange={() => toggle("notifyOnExpenseUpdate")}
            />
          }
        >
          Expense updated
        </Cell>
        <Cell
          Component="label"
          before={
            <IconSquare color="orange">
              <BellOff size={14} />
            </IconSquare>
          }
          after={
            <Switch
              checked={chat?.notifyOnSettlement ?? true}
              onChange={() => toggle("notifyOnSettlement")}
            />
          }
        >
          Settlement recorded
        </Cell>
      </Section>
    </main>
  );
}
