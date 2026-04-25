import { useCallback, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  backButton,
  hapticFeedback,
  initData,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import { Cell, Navigation, Section, Text } from "@telegram-apps/telegram-ui";
import {
  Bell,
  Clock,
  DollarSign,
  Key,
  Tag,
  User as UserIcon,
  Users,
} from "lucide-react";
import { trpc } from "@/utils/trpc";
import ChatHeader from "./ChatHeader";
import IconSquare, { type IconColor } from "./IconSquare";

type SubKey =
  | "members"
  | "currency"
  | "categories"
  | "notifications"
  | "reminders"
  | "account"
  | "developer";

const SUB_PATHS: Record<
  SubKey,
  | "/chat/$chatId/settings/members"
  | "/chat/$chatId/settings/currency"
  | "/chat/$chatId/settings/categories"
  | "/chat/$chatId/settings/notifications"
  | "/chat/$chatId/settings/reminders"
  | "/chat/$chatId/settings/account"
  | "/chat/$chatId/settings/developer"
> = {
  members: "/chat/$chatId/settings/members",
  currency: "/chat/$chatId/settings/currency",
  categories: "/chat/$chatId/settings/categories",
  notifications: "/chat/$chatId/settings/notifications",
  reminders: "/chat/$chatId/settings/reminders",
  account: "/chat/$chatId/settings/account",
  developer: "/chat/$chatId/settings/developer",
};

interface SettingsHubPageProps {
  chatId: number;
}

export default function SettingsHubPage({ chatId }: SettingsHubPageProps) {
  const navigate = useNavigate();
  const tUserData = useSignal(initData.user);
  const userId = tUserData?.id ?? 0;
  const isPrivateChat = userId === chatId;

  const { data: chat } = trpc.chat.getChat.useQuery({ chatId });
  // Telegram-side chat data carries the live group photo URL (refreshed
  // through the bot API). Our DB-stored `chat.photo` is a fallback gif.
  const { data: tChatData } = trpc.telegram.getChat.useQuery(
    { chatId },
    { enabled: !isPrivateChat }
  );
  const { data: members } = trpc.chat.listMembers.useQuery(
    { chatId },
    { enabled: !isPrivateChat }
  );
  const { data: schedule } = trpc.aws.getChatSchedule.useQuery(
    { chatId },
    { enabled: !isPrivateChat }
  );
  // Both hooks called unconditionally (Rules of Hooks); only the relevant
  // one fires the network request via `enabled`. We pick the right result at
  // render time.
  const { data: userTokens } = trpc.apiKey.listUserTokens.useQuery(undefined, {
    enabled: isPrivateChat,
  });
  const { data: chatTokens } = trpc.apiKey.listTokens.useQuery(
    { chatId },
    { enabled: !isPrivateChat }
  );
  const tokens = isPrivateChat ? userTokens : chatTokens;
  const { data: userData } = trpc.user.getUser.useQuery(
    { userId },
    { enabled: userId !== 0 }
  );

  // Back button → chat.
  useEffect(() => {
    backButton.show();
    return () => {
      backButton.hide();
    };
  }, []);
  useEffect(() => {
    const off = backButton.onClick(() => {
      hapticFeedback.notificationOccurred("success");
      if (isPrivateChat) {
        navigate({ to: "/chat", search: (prev) => ({ ...prev, title: "" }) });
      } else {
        navigate({ to: "..", search: (prev) => ({ ...prev, title: "" }) });
      }
    });
    return () => off();
  }, [navigate, isPrivateChat]);

  const goto = useCallback(
    (sub: SubKey) => {
      hapticFeedback.impactOccurred("light");
      navigate({
        to: SUB_PATHS[sub],
        params: { chatId: String(chatId) },
      });
    },
    [chatId, navigate]
  );

  const notificationsOnCount = [
    chat?.notifyOnExpense,
    chat?.notifyOnExpenseUpdate,
    chat?.notifyOnSettlement,
  ].filter(Boolean).length;

  const reminderPreview = schedule?.enabled
    ? `${schedule.dayOfWeek?.slice(0, 3) ?? ""} ${schedule.time ?? ""}`.trim()
    : "Off";

  const categoryPreview = "Manage tiles"; // No count query yet — keep static; categories sub-page shows full breakdown.

  return (
    <main className="px-3 pb-8">
      <ChatHeader
        avatarUrl={
          isPrivateChat
            ? tUserData?.photoUrl
            : (tChatData?.photoUrl?.href ?? chat?.photo)
        }
        title={chat?.title ?? "..."}
        subtitle={
          isPrivateChat
            ? "Personal chat"
            : `Group · ${members?.length ?? 0} members`
        }
        members={isPrivateChat ? [] : (members ?? [])}
        memberCount={members?.length ?? 0}
        onMembersClick={() => goto("members")}
      />

      {!isPrivateChat && (
        <Section header="Group">
          <RowLink
            color="teal"
            icon={<Users size={16} />}
            label="Members"
            value={members?.length ? String(members.length) : undefined}
            onClick={() => goto("members")}
          />
          <RowLink
            color="blue"
            icon={<DollarSign size={16} />}
            label="Currency"
            value={chat?.baseCurrency}
            onClick={() => goto("currency")}
          />
          <RowLink
            color="green"
            icon={<Tag size={16} />}
            label="Categories"
            value={categoryPreview}
            onClick={() => goto("categories")}
          />
        </Section>
      )}

      {!isPrivateChat && (
        <Section header="Notifications">
          <RowLink
            color="orange"
            icon={<Bell size={16} />}
            label="Event alerts"
            value={`${notificationsOnCount} on`}
            onClick={() => goto("notifications")}
          />
          <RowLink
            color="purple"
            icon={<Clock size={16} />}
            label="Recurring reminder"
            value={reminderPreview}
            onClick={() => goto("reminders")}
          />
        </Section>
      )}

      <Section header="Personal">
        {isPrivateChat && (
          <>
            <RowLink
              color="blue"
              icon={<DollarSign size={16} />}
              label="Currency"
              value={chat?.baseCurrency}
              onClick={() => goto("currency")}
            />
            <RowLink
              color="green"
              icon={<Tag size={16} />}
              label="Categories"
              value={categoryPreview}
              onClick={() => goto("categories")}
            />
          </>
        )}
        <RowLink
          color="gray"
          icon={<UserIcon size={16} />}
          label="Account"
          value={userData?.phoneNumber ? "Phone added" : "No phone"}
          onClick={() => goto("account")}
        />
        <RowLink
          color="red"
          icon={<Key size={16} />}
          label="Developer"
          value={tokens?.length ? `${tokens.length} active` : undefined}
          onClick={() => goto("developer")}
        />
      </Section>
    </main>
  );
}

interface RowLinkProps {
  color: IconColor;
  icon: React.ReactNode;
  label: string;
  value?: string;
  onClick: () => void;
}

function RowLink({ color, icon, label, value, onClick }: RowLinkProps) {
  const tSubtitleTextColor = useSignal(themeParams.subtitleTextColor);
  return (
    <Cell
      onClick={onClick}
      before={<IconSquare color={color}>{icon}</IconSquare>}
      after={
        <Navigation>
          {value && <Text style={{ color: tSubtitleTextColor }}>{value}</Text>}
        </Navigation>
      }
    >
      {label}
    </Cell>
  );
}
