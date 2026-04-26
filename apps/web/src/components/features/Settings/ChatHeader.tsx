import { themeParams, useSignal } from "@telegram-apps/sdk-react";
import { Avatar, Skeleton } from "@telegram-apps/telegram-ui";
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
  /** Skeleton the title/subtitle while the parent's chat query is pending. */
  loading?: boolean;
  /** Skeleton the avatar stack while the parent's members query is pending. Group only. */
  membersLoading?: boolean;
}

const MAX_PREVIEW = 4;
const SKELETON_STACK_COUNT = 4;

export default function ChatHeader({
  avatarUrl,
  title,
  subtitle,
  members = [],
  memberCount = 0,
  onMembersClick,
  loading = false,
  membersLoading = false,
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
        acronym={loading ? undefined : title.slice(0, 2).toUpperCase()}
      />
      <Skeleton visible={loading}>
        <div className="mt-2 text-base font-semibold">
          {loading ? "Loading group" : title}
        </div>
      </Skeleton>
      <Skeleton visible={loading}>
        <div className="text-sm" style={{ color: tSubtitleTextColor }}>
          {loading ? "Group · — members" : subtitle}
        </div>
      </Skeleton>

      {membersLoading ? (
        <div className="mt-3 flex" aria-hidden>
          {Array.from({ length: SKELETON_STACK_COUNT }).map((_, i) => (
            <Skeleton key={i} visible>
              <span
                className="box-border block size-8 rounded-full bg-gray-300"
                style={{
                  marginLeft: i === 0 ? 0 : -8,
                  border: `2px solid ${tBackgroundColor ?? "transparent"}`,
                }}
              />
            </Skeleton>
          ))}
        </div>
      ) : previewMembers.length > 0 ? (
        <button
          type="button"
          onClick={onMembersClick}
          className="mt-3 flex"
          aria-label="View members"
        >
          {previewMembers.map((m, i) => (
            <span
              key={m.id}
              className="box-border flex size-8 items-center justify-center rounded-full"
              style={{
                marginLeft: i === 0 ? 0 : -8,
                border: `2px solid ${tBackgroundColor ?? "transparent"}`,
                zIndex: previewMembers.length - i + 1,
              }}
            >
              <ChatMemberAvatar userId={Number(m.id)} size={28} />
            </span>
          ))}
          {overflow > 0 && (
            <span
              className="box-border flex size-8 items-center justify-center rounded-full bg-gray-300 text-xs font-semibold text-gray-700"
              style={{
                marginLeft: -8,
                border: `2px solid ${tBackgroundColor ?? "transparent"}`,
              }}
            >
              +{overflow}
            </span>
          )}
        </button>
      ) : null}
    </div>
  );
}
