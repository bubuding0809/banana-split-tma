import { hapticFeedback } from "@telegram-apps/sdk-react";
import { Cell, IconButton } from "@telegram-apps/telegram-ui";
import { X } from "lucide-react";
import ChatMemberAvatar from "@/components/ui/ChatMemberAvatar";

interface MemberRowProps {
  member: {
    id: string;
    firstName: string;
    lastName: string | null;
    username: string | null;
  };
  isYou: boolean;
  onRequestRemove: (member: MemberRowProps["member"]) => void;
}

function fullName(m: MemberRowProps["member"]) {
  return [m.firstName, m.lastName].filter(Boolean).join(" ");
}

function subtitle(m: MemberRowProps["member"], isYou: boolean) {
  const handle = m.username ? `@${m.username}` : "no username";
  return isYou ? `${handle} · You` : handle;
}

export default function MemberRow({
  member,
  isYou,
  onRequestRemove,
}: MemberRowProps) {
  return (
    <Cell
      before={<ChatMemberAvatar userId={Number(member.id)} size={40} />}
      subtitle={subtitle(member, isYou)}
      after={
        <IconButton
          size="s"
          mode="plain"
          onClick={(e) => {
            e.stopPropagation();
            hapticFeedback.impactOccurred("medium");
            onRequestRemove(member);
          }}
          aria-label={isYou ? "Leave group" : `Remove ${fullName(member)}`}
        >
          <X size={18} strokeWidth={2.5} />
        </IconButton>
      }
    >
      {fullName(member)}
    </Cell>
  );
}
