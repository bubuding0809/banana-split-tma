import { useStartParams, withForm } from "@/hooks";
import { formOpts } from "./AddExpenseForm";
import {
  Section,
  IconButton,
  Divider,
  Title,
  Button,
  Placeholder,
  Modal,
  Caption,
  AvatarProps,
  Badge,
  Text,
  ButtonCell,
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
  KeyboardOff,
  Plus,
  UserCog,
} from "lucide-react";
import { cn } from "@/utils/cn";
import { formatCurrencyWithCode, toDecimal, toNumber } from "@/utils/financial";

const SplitExactConfig = withForm({
  ...formOpts,
  props: {
    step: 2,
    isLastStep: true,
    onShowFooterChange: (show: boolean) => {
      console.info("Footer visibility changed:", show);
    },
    onFormSubmit: () => {},
  },
  render: function Render({ form, onShowFooterChange, onFormSubmit }) {
    const tStartParams = useStartParams();
    const tSubtitleTextColor = useSignal(themeParams.subtitleTextColor);
    const tButtonColor = useSignal(themeParams.buttonColor);
    const tButtonTextColor = useSignal(themeParams.buttonTextColor);
    const tSecondaryBackgroundColor = useSignal(
      themeParams.secondaryBackgroundColor
    );

    const amountInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
    const [focusedInputId, setFocusedInputId] = useState<string | null>(null);
    const [navigationEnabled, setNavigationEnabled] = useState(false);
    const [modalOpen, setModalOpen] = useState(true);

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
        // Remove the split amount if the member is deselected
        form.setFieldValue("customSplits", (prev) =>
          prev.filter((split) => split.userId !== memberId)
        );
      } else {
        form.setFieldValue("participants", [...participants, memberId]);
      }
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
                      Add Participants
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
                          </div>
                        }
                        footer={
                          <div className="mt-3">
                            <FieldInfo />
                          </div>
                        }
                      >
                        <ButtonCell
                          before={<UserCog />}
                          onClick={() => {
                            setModalOpen(true);
                            hapticFeedback.selectionChanged();
                          }}
                          style={{
                            color: tButtonColor,
                          }}
                        >
                          Edit Participants
                        </ButtonCell>
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
                              <AmountInput
                                key={memberId}
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
                                before={
                                  <div className="flex items-center gap-2">
                                    <ChatMemberAvatar
                                      userId={Number(memberId)}
                                      size={28}
                                    />
                                    <Text className="truncate">
                                      {member!.username
                                        ? `@${member!.username}`
                                        : member!.firstName}
                                    </Text>
                                  </div>
                                }
                                placeholder="0.00"
                                textAlign="right"
                                autoScale={false}
                                fixedFontSize="24px"
                              />
                            );
                          })}
                      </Section>
                    );
                  }}
                </form.AppField>

                {navigationEnabled && (
                  <footer className="fixed bottom-0 left-0 right-0 z-10 flex items-center justify-between gap-2 px-4 pb-2">
                    <form.Subscribe
                      selector={(state) => ({
                        participants: state.values.participants,
                        customSplits: state.values.customSplits,
                        amount: state.values.amount,
                        currency: state.values.currency,
                      })}
                    >
                      {({ participants, customSplits, amount, currency }) => {
                        const totalExpense = toDecimal(amount || "0");
                        const currentTotal = customSplits.reduce(
                          (acc, split) => acc.plus(toDecimal(split.amount)),
                          toDecimal(0)
                        );

                        const isBalanced = currentTotal.equals(totalExpense);
                        const difference = totalExpense.minus(currentTotal);

                        // Input stage - show balance information
                        if (participants.length === 0) {
                          return null;
                        }

                        return (
                          <div className="flex flex-col items-end">
                            {isBalanced ? (
                              <Button
                                size="s"
                                style={{
                                  backgroundColor: "#00A86B",
                                }}
                                onClick={onFormSubmit}
                              >
                                Save 🚀
                              </Button>
                            ) : (
                              <div
                                className="flex h-8 items-center rounded-full bg-gray-500 p-2 px-4"
                                style={{
                                  backgroundColor: tSecondaryBackgroundColor,
                                }}
                              >
                                <Caption
                                  weight="2"
                                  className={cn(
                                    isBalanced && "text-green-500",
                                    !isBalanced && "text-orange-500"
                                  )}
                                >
                                  {`${formatCurrencyWithCode(
                                    toNumber(difference.abs()),
                                    currency
                                  )} ${difference.greaterThan(0) ? "remaining" : "excess"}`}
                                </Caption>
                              </div>
                            )}
                          </div>
                        );
                      }}
                    </form.Subscribe>
                    <div
                      className="flex items-center gap-2 rounded-full p-1"
                      style={{
                        backgroundColor: tSecondaryBackgroundColor,
                      }}
                    >
                      <IconButton size="s" mode="gray" className="p-2">
                        <KeyboardOff />
                      </IconButton>
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

            {/* Modal for Participants */}
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
              <div className="flex flex-col gap-2 pb-8">
                <div className="max-h-80 min-h-72 overflow-y-auto p-4">
                  <div className="grid grid-cols-4 gap-5">
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
                              size={52 as AvatarProps["size"]}
                            />
                          </div>
                          {participants.includes(member.id.toString()) && (
                            <div
                              className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2"
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
                        <Caption
                          className="max-w-24 truncate text-center"
                          style={{
                            color: participants.includes(member.id.toString())
                              ? tButtonColor
                              : undefined,
                          }}
                        >
                          {member.username
                            ? `@${member.username}`
                            : member.firstName}
                        </Caption>
                      </div>
                    ))}
                  </div>
                </div>

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
                    {participants.length > 0 && (
                      <Badge
                        type="number"
                        className="absolute translate-y-0.5"
                        style={{
                          backgroundColor: tButtonColor,
                        }}
                      >
                        {participants.length}
                      </Badge>
                    )}
                  </Button>
                </>
              </div>
            </Modal>
          </>
        )}
      </form.Subscribe>
    );
  },
});

export default SplitExactConfig;
