import { Fragment } from "react";
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
  Text,
  Title,
} from "@telegram-apps/telegram-ui";
import { ArrowRight, X } from "lucide-react";

interface AddMemberSheetProps {
  chatId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLaunchBot?: () => void;
}

const STEPS = [
  "Tap below to open the bot chat",
  "Pick your contacts",
  "Swipe back to the app",
];

export default function AddMemberSheet({
  chatId,
  open,
  onOpenChange,
  onLaunchBot,
}: AddMemberSheetProps) {
  const tSubtitleTextColor = useSignal(themeParams.subtitleTextColor);
  const tButtonColor = useSignal(themeParams.buttonColor);

  const handleOpenBot = () => {
    hapticFeedback.impactOccurred("light");
    onLaunchBot?.();
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
      <div className="flex flex-col gap-5 px-4 pb-6 pt-2">
        {/* Telegram-style quote block: left accent bar + indented text */}
        <blockquote
          className="rounded-r-md border-l-[3px] py-1 pl-3"
          style={{ borderColor: tButtonColor }}
        >
          <Text style={{ color: tSubtitleTextColor }}>
            Wanna bring those friends who refuse to open the mini app?
          </Text>
        </blockquote>

        {/* Vertical step path: dots connected by a thin line */}
        <div className="flex flex-col px-2">
          {STEPS.map((step, i) => (
            <Fragment key={step}>
              <div className="flex items-center gap-3 py-1">
                <div
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: tButtonColor }}
                />
                <Text>{step}</Text>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className="ml-[4px] h-3 w-[2px]"
                  style={{ backgroundColor: tButtonColor, opacity: 0.4 }}
                />
              )}
            </Fragment>
          ))}
        </div>

        <Button
          stretched
          size="l"
          mode="filled"
          onClick={handleOpenBot}
          after={<ArrowRight size={20} strokeWidth={2.5} />}
        >
          Let&apos;s go
        </Button>
      </div>
    </Modal>
  );
}
