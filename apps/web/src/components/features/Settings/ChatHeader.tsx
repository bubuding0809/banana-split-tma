import { Avatar } from "@telegram-apps/telegram-ui";

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

function initials(m: MemberPreview): string {
  const first = m.firstName?.[0] ?? "";
  const last = m.lastName?.[0] ?? "";
  return (first + last).toUpperCase() || "?";
}

export default function ChatHeader({
  avatarUrl,
  title,
  subtitle,
  members = [],
  memberCount = 0,
  onMembersClick,
}: ChatHeaderProps) {
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
      <div className="text-(--tg-theme-subtitle-text-color) text-sm">
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
              className="bg-(--tg-theme-secondary-bg-color) flex size-8 items-center justify-center rounded-full text-xs font-semibold text-white"
              style={{
                marginLeft: i === 0 ? 0 : -8,
                background: stableMemberGradient(m.id),
                border: "2px solid var(--tg-theme-bg-color)",
              }}
            >
              {initials(m)}
            </span>
          ))}
          {overflow > 0 && (
            <span
              className="flex size-8 items-center justify-center rounded-full bg-gray-300 text-xs font-semibold text-gray-700"
              style={{
                marginLeft: -8,
                border: "2px solid var(--tg-theme-bg-color)",
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

// Deterministic gradient per member id so colors don't reshuffle across renders.
function stableMemberGradient(id: string): string {
  const palette = [
    "linear-gradient(135deg, #4facfe, #00f2fe)",
    "linear-gradient(135deg, #43e97b, #38f9d7)",
    "linear-gradient(135deg, #fa709a, #fee140)",
    "linear-gradient(135deg, #a18cd1, #fbc2eb)",
    "linear-gradient(135deg, #ff9966, #ff5e62)",
    "linear-gradient(135deg, #5ee7df, #b490ca)",
  ];
  let hash = 0;
  for (let i = 0; i < id.length; i++)
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}
