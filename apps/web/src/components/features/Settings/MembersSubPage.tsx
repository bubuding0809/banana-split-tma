import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  backButton,
  hapticFeedback,
  initData,
  useSignal,
} from "@telegram-apps/sdk-react";
import { ButtonCell, Section, Skeleton } from "@telegram-apps/telegram-ui";
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

  return (
    <main className="px-3 pb-8">
      <Section
        header={members ? `${members.length} members` : "Members"}
        footer='Tap "Add Member" to pick contacts from the bot DM and add them to this group.'
      >
        <ButtonCell
          before={<Plus size={20} />}
          onClick={() => setSheetOpen(true)}
        >
          Add Member
        </ButtonCell>

        {status === "pending" ? (
          <Skeleton visible>
            <div className="h-14" />
          </Skeleton>
        ) : (
          (members ?? []).map((m) => (
            <MemberRow key={m.id} member={m} isYou={m.id === youId} />
          ))
        )}
      </Section>

      <AddMemberSheet
        chatId={chatId}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </main>
  );
}
