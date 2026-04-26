import {
  hapticFeedback,
  openTelegramLink,
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
  chatId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AddMemberSheet({
  chatId,
  open,
  onOpenChange,
}: AddMemberSheetProps) {
  const tSubtitleTextColor = useSignal(themeParams.subtitleTextColor);

  const handleOpenBot = () => {
    hapticFeedback.impactOccurred("light");
    const deepLink = `${import.meta.env.VITE_TELEGRAM_BOT_DEEP_LINK}?start=ADD_MEMBER${chatId}`;
    openTelegramLink(deepLink);
    onOpenChange(false);
  };

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
          footer="The bot will send a contact picker. Tap Send when you're done choosing."
        >
          <div className="px-2 py-3">
            <Text style={{ color: tSubtitleTextColor }}>
              We&apos;ll open the bot DM where you can pick people from your
              Telegram contacts. They&apos;ll be added to this group.
            </Text>
          </div>
        </Section>
        <div className="flex flex-col gap-2 px-3 pt-2">
          <Button stretched size="l" mode="filled" onClick={handleOpenBot}>
            Open bot DM
          </Button>
          <Button
            stretched
            size="l"
            mode="gray"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
