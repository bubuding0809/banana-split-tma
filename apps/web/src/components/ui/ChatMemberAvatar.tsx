import { getAnimalAvatarEmoji } from "@/utils/emoji";
import { Avatar, ImageProps } from "@telegram-apps/telegram-ui";
import { initData, initDataRaw, useSignal } from "@telegram-apps/sdk-react";
import { useMemo, useState } from "react";

const TRPC_URL = import.meta.env.VITE_TRPC_URL;
// VITE_TRPC_URL points to the lambda's /api/trpc — derive the
// sibling /api/avatar base.
const AVATAR_BASE = TRPC_URL
  ? TRPC_URL.replace(/\/api\/trpc\/?$/, "/api/avatar")
  : "/api/avatar";

interface ChatMemberProps {
  userId: number;
  size?: ImageProps["size"];
}

const ChatMemberAvatar = ({ userId, size = 24 }: ChatMemberProps) => {
  const tUser = useSignal(initData.user);
  const rawAuth = initDataRaw();
  const [failed, setFailed] = useState(false);

  const src = useMemo<string | undefined>(() => {
    if (failed) return undefined;
    // Self → use the Telegram CDN URL from initData (no backend hit).
    if (tUser?.id === userId && tUser.photoUrl) {
      return tUser.photoUrl;
    }
    // Others → proxy. Drop out if we can't authenticate.
    if (!rawAuth) return undefined;
    return `${AVATAR_BASE}/${userId}?auth=${encodeURIComponent(rawAuth)}`;
  }, [failed, tUser, rawAuth, userId]);

  if (!src) {
    return (
      <Avatar size={size}>{getAnimalAvatarEmoji(userId.toString())}</Avatar>
    );
  }

  return (
    <Avatar
      size={size}
      src={src}
      onError={() => setFailed(true)}
      fallbackIcon={getAnimalAvatarEmoji(userId.toString())}
    />
  );
};

export default ChatMemberAvatar;
