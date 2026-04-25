import { themeParams, useSignal } from "@telegram-apps/sdk-react";
import { Button, Modal, Text, Title } from "@telegram-apps/telegram-ui";

interface AddMemberSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Placeholder for the upcoming Telegram contact-share flow. The actual flow
// will deeplink the user to the bot DM and trigger user_shared on a button
// press. Until that lands, we explain the eventual flow and dismiss.
export default function AddMemberSheet({
  open,
  onOpenChange,
}: AddMemberSheetProps) {
  const tSubtitleTextColor = useSignal(themeParams.subtitleTextColor);

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <div className="px-4 py-3">
        <Title level="2">Add a member</Title>
        <Text className="mt-2 block" style={{ color: tSubtitleTextColor }}>
          Soon you'll be able to share a contact with the bot in your private
          chat to add them here. We'll let you know once it's ready.
        </Text>
        <Button
          stretched
          mode="filled"
          className="mt-4"
          onClick={() => onOpenChange(false)}
        >
          Got it
        </Button>
      </div>
    </Modal>
  );
}
