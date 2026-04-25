import {
  hapticFeedback,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import {
  Button,
  IconButton,
  Modal,
  Section,
  Text,
  Title,
} from "@telegram-apps/telegram-ui";
import { X } from "lucide-react";

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
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      header={
        <Modal.Header
          before={
            <Title weight="2" level="3">
              Add a member
            </Title>
          }
          after={
            <Modal.Close>
              <IconButton
                size="s"
                mode="gray"
                onClick={() => hapticFeedback.impactOccurred("light")}
              >
                <X
                  size={20}
                  strokeWidth={3}
                  style={{ color: tSubtitleTextColor }}
                />
              </IconButton>
            </Modal.Close>
          }
        />
      }
    >
      <div className="pb-6">
        <Section
          className="px-3"
          footer="Soon you'll be able to share a contact with the bot in your private chat to add them here. We'll let you know once it's ready."
        >
          <div className="px-2 py-3">
            <Text style={{ color: tSubtitleTextColor }}>
              This flow isn't wired up yet — coming soon.
            </Text>
          </div>
        </Section>
        <div className="px-3 pt-2">
          <Button
            stretched
            size="l"
            mode="filled"
            onClick={() => onOpenChange(false)}
          >
            Got it
          </Button>
        </div>
      </div>
    </Modal>
  );
}
