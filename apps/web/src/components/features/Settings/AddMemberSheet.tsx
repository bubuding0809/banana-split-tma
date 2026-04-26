import { ReactNode } from "react";
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
  label: string; // Stable string for React key + accessible fallback
  labelNode?: ReactNode; // Overrides label rendering when present
  mockup?: ReactNode;
}

export default function AddMemberSheet({
  chatId,
  open,
  onOpenChange,
  onLaunchBot,
}: AddMemberSheetProps) {
  const tSubtitleTextColor = useSignal(themeParams.subtitleTextColor);
  const tButtonColor = useSignal(themeParams.buttonColor);
  const tButtonTextColor = useSignal(themeParams.buttonTextColor);
  const tSecondaryBgColor = useSignal(themeParams.secondaryBackgroundColor);

  const handleOpenBot = () => {
    hapticFeedback.impactOccurred("light");
    onLaunchBot?.();
    const deepLink = `${import.meta.env.VITE_TELEGRAM_BOT_DEEP_LINK}?start=ADD_MEMBER${chatId}`;
    openTelegramLink(deepLink);
    onOpenChange(false);
  };

  // Stylized mini-mockups of the actual Telegram UI the user will see
  // in each step. Themed via secondaryBackgroundColor (card surface) +
  // subtle white overlays for inner elements.
  const cardStyle = { backgroundColor: tSecondaryBgColor };
  const innerPillClass =
    "rounded-md bg-white/5 px-2 py-1 text-center text-[11px]";

  const STEPS: StepDef[] = [
    {
      label: "Tap the Let's go button below to open the bot chat",
      labelNode: (
        <>
          Tap the{" "}
          <span
            className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 align-middle text-[12px] font-semibold"
            style={{
              backgroundColor: tButtonColor,
              color: tButtonTextColor,
            }}
          >
            Let&apos;s go
            <ArrowRight size={10} strokeWidth={3} />
          </span>{" "}
          button below to open the bot chat
        </>
      ),
      // No mockup — the bot chat is just Telegram, no specific UI to show.
    },
    {
      label: "Pick your contacts",
      mockup: (
        <div className="mt-3 space-y-3">
          <div>
            <div
              className="mb-1.5 text-[12px]"
              style={{ color: tSubtitleTextColor }}
            >
              1. Tap the keyboard button to open the contact picker
            </div>
            {/* Reply-keyboard buttons that appear in the bot DM */}
            <div
              className="space-y-1 rounded-lg border border-white/5 p-2"
              style={cardStyle}
            >
              <div className={innerPillClass}>👤 Select user(s)</div>
              <div className={innerPillClass}>❌ Cancel</div>
            </div>
          </div>

          <div>
            <div
              className="mb-1.5 text-[12px]"
              style={{ color: tSubtitleTextColor }}
            >
              2. Pick your friends
            </div>
            {/* Tapping "Select user(s)" opens the contact picker dialog */}
            <div
              className="space-y-2 rounded-lg border border-white/5 p-2"
              style={cardStyle}
            >
              {/* Top bar: rounded ✕ button on left, centered title + counter, spacer right */}
              <div className="flex items-center gap-2">
                <div
                  className="grid size-5 shrink-0 place-items-center rounded-full bg-white/10 text-[9px]"
                  style={{ color: tSubtitleTextColor }}
                >
                  ✕
                </div>
                <div className="flex-1 text-center leading-tight">
                  <div className="text-[10px] font-semibold">Select Users</div>
                  <div
                    className="text-[8px]"
                    style={{ color: tSubtitleTextColor }}
                  >
                    0/10
                  </div>
                </div>
                <div className="size-5 shrink-0" />
              </div>

              {/* Search pill */}
              <div
                className="flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-[10px]"
                style={{ color: tSubtitleTextColor }}
              >
                <span className="text-[9px]">🔍</span>
                <span>Search</span>
              </div>

              {/* Section header */}
              <div
                className="px-1 pt-0.5 text-[8px] font-medium tracking-wider"
                style={{ color: tSubtitleTextColor }}
              >
                FREQUENT CONTACTS
              </div>

              {/* Contact rows */}
              <div className="space-y-1.5 px-0.5">
                <div className="flex items-center gap-2">
                  <div
                    className="size-2.5 shrink-0 rounded-full border-[1.5px]"
                    style={{ borderColor: tSubtitleTextColor }}
                  />
                  <div className="bg-linear-to-br size-6 shrink-0 rounded-full from-orange-400 to-pink-500" />
                  <div className="min-w-0 flex-1 leading-tight">
                    <div className="text-[10px]">
                      Alex <span className="font-semibold">Carter</span>
                    </div>
                    <div
                      className="text-[8px]"
                      style={{ color: tSubtitleTextColor }}
                    >
                      last seen 5 minutes ago
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className="size-2.5 shrink-0 rounded-full border-[1.5px]"
                    style={{ borderColor: tSubtitleTextColor }}
                  />
                  <div className="bg-linear-to-br size-6 shrink-0 rounded-full from-cyan-400 to-blue-600" />
                  <div className="min-w-0 flex-1 leading-tight">
                    <div className="text-[10px]">
                      Sam <span className="font-semibold">Wilson</span>
                    </div>
                    <div
                      className="text-[8px]"
                      style={{ color: tSubtitleTextColor }}
                    >
                      last seen yesterday
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      label: "Swipe back to the app",
      // No mockup — gesture is self-explanatory.
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
              Add members
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

        {/* Vertical step path. Connector line runs from each dot down to
            the next via absolute positioning so it spans the full card
            height regardless of mockup size. Last step omits the line. */}
        <div className="px-2">
          {STEPS.map((step, i) => {
            const isLast = i === STEPS.length - 1;
            return (
              <div
                key={step.label}
                className={`relative pl-9 ${isLast ? "" : "pb-6"}`}
              >
                {/* Connector line — runs from below this circle to the next */}
                {!isLast && (
                  <div
                    className="absolute bottom-0 left-[9px] top-6 w-[2px]"
                    style={{
                      backgroundColor: tButtonColor,
                      opacity: 0.5,
                    }}
                  />
                )}
                {/* Outlined circle + inner dot */}
                <div
                  className="absolute left-0 top-0.5 grid size-5 place-items-center rounded-full border-2"
                  style={{ borderColor: tButtonColor }}
                >
                  <div
                    className="size-2 rounded-full"
                    style={{ backgroundColor: tButtonColor }}
                  />
                </div>
                {/* Title — bolder per the Tailwind UI reference */}
                <div className="text-[15px] font-medium leading-snug">
                  {step.labelNode ?? step.label}
                </div>
                {step.mockup}
              </div>
            );
          })}
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
