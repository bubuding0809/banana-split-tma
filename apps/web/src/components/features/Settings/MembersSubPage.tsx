import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  backButton,
  hapticFeedback,
  initData,
  useSignal,
} from "@telegram-apps/sdk-react";
import {
  Avatar,
  ButtonCell,
  Cell,
  Section,
  Skeleton,
} from "@telegram-apps/telegram-ui";
import { Plus } from "lucide-react";
import { trpc } from "@/utils/trpc";
import MemberRow from "./MemberRow";
import AddMemberSheet from "./AddMemberSheet";

interface MembersSubPageProps {
  chatId: number;
}

export default function MembersSubPage({ chatId }: MembersSubPageProps) {
  const navigate = useNavigate();
  const tUserData = useSignal(initData.user);
  const youId = tUserData?.id?.toString();

  const [sheetOpen, setSheetOpen] = useState(false);

  const { data: members, status } = trpc.chat.listMembers.useQuery({ chatId });
  const trpcUtils = trpc.useUtils();
  const didStartAddFlow = useRef(false);

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

  // When the user returns from the bot DM after launching the add-member
  // flow, re-fetch the members list so newly-added members appear without
  // a manual refresh. Gated on didStartAddFlow so we don't refetch on
  // unrelated tab switches.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && didStartAddFlow.current) {
        didStartAddFlow.current = false;
        trpcUtils.chat.listMembers.invalidate({ chatId });
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [chatId, trpcUtils]);

  return (
    <main className="px-3 pb-8">
      <Section
        header={members ? `${members.length} members` : "Members"}
        footer='Tap "Add Member" to pick people from your Telegram contacts via the bot.'
      >
        <ButtonCell
          before={<Plus size={20} />}
          onClick={() => setSheetOpen(true)}
        >
          Add Member
        </ButtonCell>

        {status === "pending"
          ? Array.from({ length: 4 }).map((_, i) => (
              <Cell
                key={`skeleton-${i}`}
                before={<Avatar size={40} />}
                subtitle={
                  <Skeleton visible>
                    <span>@username</span>
                  </Skeleton>
                }
              >
                <Skeleton visible>
                  <span>Loading member</span>
                </Skeleton>
              </Cell>
            ))
          : (members ?? []).map((m) => (
              <MemberRow key={m.id} member={m} isYou={m.id === youId} />
            ))}
      </Section>

      <AddMemberSheet
        chatId={chatId}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onLaunchBot={() => {
          didStartAddFlow.current = true;
        }}
      />
    </main>
  );
}
