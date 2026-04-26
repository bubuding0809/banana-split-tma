import { Badge, Cell } from "@telegram-apps/telegram-ui";
import ChatMemberAvatar from "@/components/ui/ChatMemberAvatar";

interface MemberRowProps {
  member: {
    id: string;
    firstName: string;
    lastName: string | null;
    username: string | null;
  };
  isYou: boolean;
}

function fullName(m: MemberRowProps["member"]) {
  return [m.firstName, m.lastName].filter(Boolean).join(" ");
}

export default function MemberRow({ member, isYou }: MemberRowProps) {
  return (
    <Cell
      before={<ChatMemberAvatar userId={Number(member.id)} size={40} />}
      subtitle={member.username ? `@${member.username}` : "no username"}
      after={
        isYou ? (
          <Badge type="number" mode="primary">
            You
          </Badge>
        ) : null
      }
    >
      {fullName(member)}
    </Cell>
  );
}
