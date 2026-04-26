import { Fragment, ReactNode } from "react";
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

interface StepDef {
  label: string;
  mockup: ReactNode;
}

export default function AddMemberSheet({
  chatId,
  open,
  onOpenChange,
  onLaunchBot,
}: AddMemberSheetProps) {
  const tSubtitleTextColor = useSignal(themeParams.subtitleTextColor);
  const tButtonColor = useSignal(themeParams.buttonColor);
  const tSecondaryBgColor = useSignal(themeParams.secondaryBackgroundColor);

  const handleOpenBot = () => {
    hapticFeedback.impactOccurred("light");
    onLaunchBot?.();
    const deepLink = `${import.meta.env.VITE_TELEGRAM_BOT_DEEP_LINK}?start=ADD_MEMBER${chatId}`;
    openTelegramLink(deepLink);
    onOpenChange(false);
  };

  // Stylized mini-mockups of the actual Telegram UI the user will see
  // in each step. Themed via secondaryBgColor (card surface) +
  // subtle white overlays for inner elements.
  const cardBaseClass =
    "mt-2 max-w-[260px] rounded-lg border border-white/5 p-2";
  const cardStyle = { backgroundColor: tSecondaryBgColor };
  const innerPillClass =
    "rounded-md bg-white/5 px-2 py-1 text-center text-[11px]";

  const STEPS: StepDef[] = [
    {
      label: "Tap below to open the bot chat",
      mockup: (
        <div className={`${cardBaseClass} space-y-1`} style={cardStyle}>
          <div className={innerPillClass}>👤 Select user(s)</div>
          <div className={innerPillClass}>❌ Cancel</div>
        </div>
      ),
    },
    {
      label: "Pick your contacts",
      mockup: (
        <div className={`${cardBaseClass} space-y-1.5`} style={cardStyle}>
          <div className="flex items-center justify-between px-1 text-[10px]">
            <span>✕</span>
            <span className="font-semibold">Select Users</span>
            <span style={{ color: tSubtitleTextColor }}>0/10</span>
          </div>
          <div
            className="rounded-full bg-white/5 px-2 py-0.5 text-[9px]"
            style={{ color: tSubtitleTextColor }}
          >
            🔍 Search
          </div>
          <div
            className="text-[8px] tracking-wider"
            style={{ color: tSubtitleTextColor }}
          >
            FREQUENT CONTACTS
          </div>
          <div className="flex items-center gap-1.5">
            <div
              className="size-2 shrink-0 rounded-full border"
              style={{ borderColor: tSubtitleTextColor }}
            />
            <div className="size-3 shrink-0 rounded-full bg-orange-500/70" />
            <span className="text-[10px]">Clive</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div
              className="size-2 shrink-0 rounded-full border"
              style={{ borderColor: tSubtitleTextColor }}
            />
            <div className="size-3 shrink-0 rounded-full bg-cyan-500/70" />
            <span className="text-[10px]">Anthony</span>
          </div>
        </div>
      ),
    },
    {
      label: "Swipe back to the app",
      mockup: (
        <div
          className={`${cardBaseClass} flex items-center gap-2`}
          style={cardStyle}
        >
          <span className="text-base" style={{ color: tButtonColor }}>
            ◀
          </span>
          <span className="text-[11px]" style={{ color: tSubtitleTextColor }}>
            swipe back
          </span>
        </div>
      ),
    },
  ];

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

        {/* Vertical step path with mockups under each label */}
        <div className="flex flex-col px-2">
          {STEPS.map((step, i) => (
            <Fragment key={step.label}>
              <div className="flex items-start gap-3 py-1">
                <div
                  className="mt-1.5 size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: tButtonColor }}
                />
                <div className="min-w-0 flex-1">
                  <Text>{step.label}</Text>
                  {step.mockup}
                </div>
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
