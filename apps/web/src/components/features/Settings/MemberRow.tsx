import { Cell } from "@telegram-apps/telegram-ui";

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
function initials(m: MemberRowProps["member"]) {
  const first = m.firstName?.[0] ?? "";
  const last = m.lastName?.[0] ?? "";
  return (first + last).toUpperCase() || "?";
}

export default function MemberRow({ member, isYou }: MemberRowProps) {
  return (
    <Cell
      before={
        <span className="flex size-10 items-center justify-center rounded-full bg-blue-200 text-sm font-semibold text-blue-700">
          {initials(member)}
        </span>
      }
      subtitle={member.username ? `@${member.username}` : "no username"}
      after={
        isYou ? (
          <span className="rounded bg-gray-400 px-2 py-0.5 text-xs font-medium text-white">
            You
          </span>
        ) : null
      }
    >
      {fullName(member)}
    </Cell>
  );
}
