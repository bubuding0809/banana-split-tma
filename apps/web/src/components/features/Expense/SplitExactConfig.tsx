import { useStartParams, withForm } from "@/hooks";
import { formOpts } from "./AddExpenseForm";
import {
  Section,
  Cell,
  IconButton,
  Divider,
  Title,
  Button,
  Placeholder,
  Modal,
  Caption,
  AvatarProps,
  Badge,
} from "@telegram-apps/telegram-ui";
import { trpc } from "@/utils/trpc";
import {
  hapticFeedback,
  mainButton,
  secondaryButton,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import ChatMemberAvatar from "@/components/ui/ChatMemberAvatar";
import FieldInfo from "@/components/ui/FieldInfo";
import AmountInput from "@/components/ui/AmountInput";
import { useStore } from "@tanstack/react-form";
import { useCallback, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Plus,
  UserCog,
  XCircle,
} from "lucide-react";
import { cn } from "@/utils/cn";

const SplitExactConfig = withForm({
  ...formOpts,
  props: {
    step: 2,
    isLastStep: true,
    onShowFooterChange: (show: boolean) => {
      console.log("Footer visibility changed:", show);
    },
  },
  render: function Render({ form, onShowFooterChange }) {
    const tStartParams = useStartParams();
    const tSubtitleTextColor = useSignal(themeParams.subtitleTextColor);
    const tButtonColor = useSignal(themeParams.buttonColor);
    const tButtonTextColor = useSignal(themeParams.buttonTextColor);
    const tDestructiveTextColor = useSignal(themeParams.destructiveTextColor);
    const tSecondaryBackgroundColor = useSignal(
      themeParams.secondaryBackgroundColor
    );

    const amountInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
    const [focusedInputId, setFocusedInputId] = useState<string | null>(null);
    const [navigationEnabled, setNavigationEnabled] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);

    const chatId = tStartParams?.chat_id ?? 0;
    const { currency, participants, customSplits } = useStore(
      form.store,
      (state) => ({
        currency: state.values.currency,
        participants: state.values.participants,
        customSplits: state.values.customSplits,
      })
    );

    // * Queries ===================================================================================
    const { data: chatMembers } = trpc.chat.getMembers.useQuery({ chatId });
    const { data: supportedCurrencies } =
      trpc.currency.getSupportedCurrencies.useQuery({});

    // Navigation logic for AmountInputs
    const getInputOrder = useCallback((): string[] => {
      return participants.filter((participantId) =>
        chatMembers?.find(
          (member) => Number(member.id).toString() === participantId
        )
      );
    }, [participants, chatMembers]);

    const navigateToInput = useCallback(
      (direction: "up" | "down") => {
        const inputOrder = getInputOrder();
        const currentIndex = inputOrder.findIndex(
          (id) => id === focusedInputId
        );

        if (currentIndex === -1) return;

        let nextIndex;
        if (direction === "down") {
          nextIndex = (currentIndex + 1) % inputOrder.length; // Wrap to first
        } else {
          nextIndex =
            currentIndex === 0 ? inputOrder.length - 1 : currentIndex - 1; // Wrap to last
        }

        const nextInputId = inputOrder[nextIndex];
        amountInputRefs.current[nextInputId]?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
        amountInputRefs.current[nextInputId]?.focus({
          preventScroll: true,
        });
        amountInputRefs.current[nextInputId]?.select();
        hapticFeedback.selectionChanged();
      },
      [focusedInputId, getInputOrder]
    );

    const handleMemberToggle = (memberId: string) => {
      const isSelected = participants.includes(memberId);
      if (isSelected) {
        form.setFieldValue(
          "participants",
          participants.filter((id) => id !== memberId)
        );
      } else {
        form.setFieldValue("participants", [...participants, memberId]);
      }
      hapticFeedback.impactOccurred("light");
    };

    return (
      <form.Subscribe
        selector={(state) => ({
          participants: state.values.participants,
        })}
      >
        {({ participants }) => (
          <>
            {participants.length === 0 ? (
              <Section
                header={<Section.Header large>Who is involved?</Section.Header>}
                footer={
                  <form.AppField name="participants">
                    {() => (
                      <div className="mt-3">
                        <FieldInfo />
                      </div>
                    )}
                  </form.AppField>
                }
              >
                <Placeholder
                  description={"Include participants to split with"}
                  action={
                    <Button
                      before={<Plus />}
                      stretched
                      mode="filled"
                      onClick={() => setModalOpen(true)}
                      style={{
                        backgroundColor: tButtonColor,
                        color: tButtonTextColor,
                      }}
                    >
                      Select Participants
                    </Button>
                  }
                >
                  <img
                    alt="Telegram sticker"
                    src="https://orodqkvkgttuahfmlajx.supabase.co/storage/v1/object/public/assets/gifs/banana-cash.gif"
                    style={{
                      display: "block",
                      height: "120px",
                      width: "120px",
                    }}
                  />
                </Placeholder>
              </Section>
            ) : (
              <div>
                <form.AppField name="customSplits">
                  {(field) => {
                    const handleAmountChange = (
                      userId: string,
                      value: string
                    ) => {
                      const newSplits = [...customSplits];
                      const existingIndex = newSplits.findIndex(
                        (s) => s.userId === userId
                      );

                      if (existingIndex >= 0) {
                        if (value === "" || value === "0") {
                          // Remove the split if amount is empty or zero
                          newSplits.splice(existingIndex, 1);
                        } else {
                          newSplits[existingIndex] = { userId, amount: value };
                        }
                      } else if (value !== "" && value !== "0") {
                        // Add new split if value is not empty or zero
                        newSplits.push({ userId, amount: value });
                      }

                      field.handleChange(newSplits);
                    };

                    const getAmountForUser = (userId: string): string => {
                      const split = customSplits.find(
                        (s) => s.userId === userId
                      );
                      return split?.amount || "";
                    };

                    return (
                      <Section
                        header={
                          <div className="flex items-start justify-between">
                            <Section.Header large>
                              Enter exact amounts
                            </Section.Header>
                            <Section.Header large>
                              <button
                                onClick={() => setModalOpen(true)}
                                style={{
                                  color: tButtonColor,
                                }}
                                className="flex items-center gap-1.5"
                              >
                                <UserCog size={18} /> Participants
                              </button>
                            </Section.Header>
                          </div>
                        }
                        footer={
                          <div className="mt-3">
                            <FieldInfo />
                          </div>
                        }
                      >
                        {participants
                          .map((participantId) =>
                            chatMembers?.find(
                              (member) =>
                                Number(member.id).toString() === participantId
                            )
                          )
                          .filter(Boolean)
                          .map((member) => {
                            const memberId = Number(member!.id).toString();
                            const currentAmount = getAmountForUser(memberId);
                            const currencySymbol = supportedCurrencies?.find(
                              (c) => c.code === currency
                            )?.symbol;

                            return (
                              <>
                                <Cell
                                  key={memberId}
                                  before={
                                    <ChatMemberAvatar
                                      userId={Number(memberId)}
                                      size={28}
                                    />
                                  }
                                  after={
                                    <IconButton
                                      size="s"
                                      type="button"
                                      onClick={() => {
                                        form.setFieldValue(
                                          "participants",
                                          (prev) =>
                                            prev.filter((id) => id !== memberId)
                                        );
                                        handleAmountChange(memberId, "");
                                        hapticFeedback.impactOccurred("medium");
                                      }}
                                      mode="plain"
                                      style={{
                                        color: tDestructiveTextColor,
                                        paddingRight: "0px",
                                      }}
                                    >
                                      <XCircle size={20} />
                                    </IconButton>
                                  }
                                >
                                  {member!.username
                                    ? `@${member!.username}`
                                    : member!.firstName}
                                </Cell>
                                <Divider />
                                <AmountInput
                                  ref={(el) => {
                                    if (el) {
                                      amountInputRefs.current[memberId] = el;
                                    } else {
                                      delete amountInputRefs.current[memberId];
                                    }
                                  }}
                                  value={currentAmount}
                                  onChange={(value) =>
                                    handleAmountChange(memberId, value)
                                  }
                                  onFocus={() => {
                                    amountInputRefs.current[
                                      memberId
                                    ]?.scrollIntoView({
                                      behavior: "smooth",
                                      block: "center",
                                    });
                                    setFocusedInputId(memberId);
                                    setNavigationEnabled(true);
                                    onShowFooterChange(false);
                                    mainButton.setParams.ifAvailable({
                                      isVisible: false,
                                    });
                                    secondaryButton.setParams.ifAvailable({
                                      isVisible: false,
                                    });
                                  }}
                                  onBlur={() => {
                                    // Small delay to handle focus transitions between inputs
                                    setTimeout(() => {
                                      const activeElement =
                                        document.activeElement;
                                      if (
                                        activeElement?.tagName !== "INPUT" ||
                                        !activeElement?.closest(
                                          "[data-amount-input]"
                                        )
                                      ) {
                                        setFocusedInputId(null);
                                        setNavigationEnabled(false);
                                        onShowFooterChange(true);
                                        mainButton.setParams.ifAvailable({
                                          isVisible: true,
                                        });
                                        secondaryButton.setParams.ifAvailable({
                                          isVisible: true,
                                        });
                                      }
                                    }, 100);
                                  }}
                                  after={
                                    <Title
                                      style={{
                                        color: tSubtitleTextColor,
                                      }}
                                    >
                                      {currencySymbol}
                                    </Title>
                                  }
                                  placeholder="0.00"
                                  textAlign="left"
                                  autoScale={false}
                                  fixedFontSize="32px"
                                />
                              </>
                            );
                          })}
                      </Section>
                    );
                  }}
                </form.AppField>

                {navigationEnabled && (
                  <footer className="fixed bottom-0 left-0 right-0 z-10 flex items-center justify-between gap-2 px-4 pb-2">
                    <IconButton size="s">
                      <Check />
                    </IconButton>

                    <div className="flex items-center gap-2">
                      <IconButton
                        size="s"
                        onClick={(e) => {
                          e.preventDefault();
                          navigateToInput("up");
                        }}
                        style={{
                          backgroundColor: tButtonColor,
                        }}
                      >
                        <ChevronUp
                          style={{
                            color: tButtonTextColor,
                          }}
                        />
                      </IconButton>
                      <IconButton
                        size="s"
                        onClick={(e) => {
                          e.preventDefault();
                          navigateToInput("down");
                        }}
                        style={{
                          backgroundColor: tButtonColor,
                        }}
                      >
                        <ChevronDown
                          style={{
                            color: tButtonTextColor,
                          }}
                        />
                      </IconButton>
                    </div>
                  </footer>
                )}
              </div>
            )}
            <Modal
              open={modalOpen}
              onOpenChange={(open) => {
                if (!open) {
                  onShowFooterChange(true);
                  mainButton.setParams.ifAvailable({
                    isVisible: true,
                  });
                  secondaryButton.setParams.ifAvailable({
                    isVisible: true,
                  });
                } else {
                  onShowFooterChange(false);
                  mainButton.setParams.ifAvailable({
                    isVisible: false,
                  });
                  secondaryButton.setParams.ifAvailable({
                    isVisible: false,
                  });
                }
                setModalOpen(open);
              }}
              header={
                <Modal.Header
                  before={
                    <Title level="3" weight="1">
                      Participants
                    </Title>
                  }
                />
              }
            >
              <div className="flex min-h-80 flex-col gap-2 pb-8">
                <div className="grid grid-cols-4 gap-4 p-4">
                  {chatMembers?.map((member) => (
                    <div
                      key={member.id}
                      className="flex flex-col items-center gap-2"
                      onClick={() => handleMemberToggle(member.id.toString())}
                    >
                      <div className="relative flex items-center justify-center">
                        <div
                          className={cn(
                            participants.includes(member.id.toString()) &&
                              "ring-offset-3 rounded-full ring-2"
                          )}
                          style={
                            {
                              "--tw-ring-color": tButtonColor,
                              "--tw-ring-offset-color":
                                tSecondaryBackgroundColor,
                            } as React.CSSProperties
                          }
                        >
                          <ChatMemberAvatar
                            userId={Number(member.id)}
                            size={64 as AvatarProps["size"]}
                          />
                        </div>
                        {participants.includes(member.id.toString()) && (
                          <div
                            className="absolute -bottom-1 right-0 flex h-6 w-6 items-center justify-center rounded-full border-2"
                            style={{
                              backgroundColor: tButtonColor,
                              borderColor: tSecondaryBackgroundColor,
                            }}
                          >
                            <Check
                              size={15}
                              color={tButtonTextColor}
                              strokeWidth={2}
                            />
                          </div>
                        )}
                      </div>
                      <Caption className="text-center">
                        {member.firstName} {member.lastName}
                      </Caption>
                    </div>
                  ))}
                </div>
                {participants.length > 0 && (
                  <>
                    <Divider />
                    <Button
                      mode="plain"
                      size="l"
                      onClick={() => {
                        setModalOpen(false);
                        hapticFeedback.notificationOccurred("success");
                      }}
                      className="relative mx-2"
                      style={{
                        color: tButtonColor,
                      }}
                    >
                      Done
                      <Badge
                        type="number"
                        className="absolute translate-y-0.5"
                        style={{
                          backgroundColor: tButtonColor,
                        }}
                      >
                        {participants.length}
                      </Badge>
                    </Button>
                  </>
                )}
              </div>
            </Modal>
          </>
        )}
      </form.Subscribe>
    );
  },
});

export default SplitExactConfig;
