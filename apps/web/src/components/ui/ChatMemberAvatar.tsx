import { trpc } from "@/utils/trpc";
import { Avatar, ImageProps } from "@telegram-apps/telegram-ui";

interface ChatMemberProps {
  userId: number;
  size?: ImageProps["size"];
}

const ChatMemberAvatar = ({ userId, size = 24 }: ChatMemberProps) => {
  const { data: photoUrl } = trpc.telegram.getUserProfilePhotoUrl.useQuery({
    userId,
  });

  if (!photoUrl) {
    return <Avatar size={size}>🐵</Avatar>;
  }
  return <Avatar src={photoUrl} size={size} />;
};

export default ChatMemberAvatar;
