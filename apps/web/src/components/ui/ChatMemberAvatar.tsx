import { getAnimalAvatarEmoji } from "@/utils/emoji";
import { Avatar, ImageProps } from "@telegram-apps/telegram-ui";

interface ChatMemberProps {
  userId: number;
  size?: ImageProps["size"];
}

const ChatMemberAvatar = ({ userId, size = 24 }: ChatMemberProps) => {
  // Real-photo logic lands in Task 11 (initData + /api/avatar proxy).
  return <Avatar size={size}>{getAnimalAvatarEmoji(userId.toString())}</Avatar>;
};

export default ChatMemberAvatar;
