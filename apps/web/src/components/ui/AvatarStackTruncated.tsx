import {
  Avatar,
  AvatarStack,
  type AvatarStackProps,
  Caption,
} from "@telegram-apps/telegram-ui";

interface AvatarStackTruncatedProps {
  limit?: number;
  children: AvatarStackProps["children"];
}
const AvatarStackTruncated = ({
  limit = 3,
  children,
}: AvatarStackTruncatedProps) => {
  const truncatedAvatars = children.slice(0, limit);

  if (children.length > limit) {
    truncatedAvatars.push(
      <Avatar key="additional-count" size={children.at(0)?.props.size || 28}>
        <Caption>+{children.length - limit}</Caption>
      </Avatar>
    );
  }

  return <AvatarStack>{truncatedAvatars}</AvatarStack>;
};

export default AvatarStackTruncated;
