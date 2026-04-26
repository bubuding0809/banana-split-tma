import { themeParams, useSignal } from "@telegram-apps/sdk-react";
import { Avatar } from "@telegram-apps/telegram-ui";
import ChatMemberAvatar from "@/components/ui/ChatMemberAvatar";

interface MemberPreview {
  id: string;
  firstName: string;
  lastName: string | null;
}

interface ChatHeaderProps {
  avatarUrl?: string;
  title: string;
  subtitle: string;
  /** Preview avatars for the member-stack (group only). Pass [] to hide. */
  members?: MemberPreview[];
  /** Total member count, used for the "+N" overflow chip. */
  memberCount?: number;
  onMembersClick?: () => void;
}

const MAX_PREVIEW = 4;

export default function ChatHeader({
  avatarUrl,
  title,
  subtitle,
  members = [],
  memberCount = 0,
  onMembersClick,
}: ChatHeaderProps) {
  const tSubtitleTextColor = useSignal(themeParams.subtitleTextColor);
  const tBackgroundColor = useSignal(themeParams.backgroundColor);

  const previewMembers = members.slice(
    0,
    MAX_PREVIEW - (memberCount > MAX_PREVIEW ? 1 : 0)
  );
  const overflow = Math.max(0, memberCount - previewMembers.length);

  return (
    <div className="flex flex-col items-center px-4 pb-3 pt-4">
      <Avatar
        size={96}
        src={avatarUrl}
        acronym={title.slice(0, 2).toUpperCase()}
      />
      <div className="mt-2 text-base font-semibold">{title}</div>
      <div className="text-sm" style={{ color: tSubtitleTextColor }}>
        {subtitle}
      </div>

      {previewMembers.length > 0 && (
        <button
          type="button"
          onClick={onMembersClick}
          className="mt-3 flex"
          aria-label="View members"
        >
          {previewMembers.map((m, i) => (
            <span
              key={m.id}
              className="rounded-full"
              style={{
                marginLeft: i === 0 ? 0 : -8,
                border: `2px solid ${tBackgroundColor ?? "transparent"}`,
              }}
            >
              <ChatMemberAvatar userId={Number(m.id)} size={28} />
            </span>
          ))}
          {overflow > 0 && (
            <span
              className="flex size-7 items-center justify-center rounded-full bg-gray-300 text-xs font-semibold text-gray-700"
              style={{
                marginLeft: -8,
                border: `2px solid ${tBackgroundColor ?? "transparent"}`,
              }}
            >
              +{overflow}
            </span>
          )}
        </button>
      )}
    </div>
  );
}
