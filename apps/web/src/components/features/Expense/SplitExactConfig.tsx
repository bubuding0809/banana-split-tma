import { useStartParams, withForm } from "@/hooks";
import { formOpts } from "./AddExpenseForm";
import {
  Section,
  Cell,
  Checkbox,
  Text,
  IconButton,
  Divider,
  Title,
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
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, XCircle } from "lucide-react";

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

    const amountInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
    const [focusedInputId, setFocusedInputId] = useState<string | null>(null);
    const [navigationEnabled, setNavigationEnabled] = useState(false);

    const chatId = tStartParams?.chat_id ?? 0;
    const { currency, participants, customSplits, exactSplitStage } = useStore(
      form.store,
      (state) => ({
        currency: state.values.currency,
        participants: state.values.participants,
        customSplits: state.values.customSplits,
        exactSplitStage: state.values.exactSplitStage,
      })
    );

    // Initialize the stage if not set
    useEffect(() => {
      if (!exactSplitStage) {
        form.setFieldValue("exactSplitStage", "selection");
      }
    }, [exactSplitStage, form]);

    const currentStage = exactSplitStage || "selection";

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

    const payerData = chatMembers?.find(
      (member) => member.id === BigInt(form.state.values.payee)
    );

    useEffect(() => {
      if (currentStage === "inputs") {
        mainButton.setParams.ifAvailable({
          isVisible: true,
        });
      } else {
        mainButton.setParams.ifAvailable({
          isVisible: false,
        });
      }

      return () => {
        mainButton.setParams.ifAvailable({
          isVisible: true,
        });
      };
    }, [currentStage]);

    // Stage 1: Member Selection
    if (currentStage === "selection") {
      return (
        <form.AppField name="participants">
          {(field) => (
            <section>
              <Section
                header={
                  <div className="flex justify-between">
                    <Section.Header large>Who is involved?</Section.Header>
                    <Section.Header large>
                      <span
                        style={{
                          color: tSubtitleTextColor,
                        }}
                      >
                        @{payerData?.username} paid
                      </span>
                    </Section.Header>
                  </div>
                }
              >
                <Cell
                  Component="label"
                  after={
                    <Checkbox
                      name="select-all"
                      value="select-all"
                      checked={field.state.value.length === chatMembers?.length}
                      onChange={(e) => {
                        const isAllSelected = e.target.checked;
                        if (isAllSelected) {
                          const allParticipantIds =
                            chatMembers?.map((member) =>
                              Number(member.id).toString()
                            ) || [];
                          field.handleChange(allParticipantIds);
                        } else {
                          field.handleChange([]);
                        }
                        hapticFeedback.notificationOccurred("success");
                      }}
                    />
                  }
                >
                  <Text className="text-gray-400">Select all members</Text>
                </Cell>
                {chatMembers?.map((member) => {
                  const memberId = Number(member.id).toString();
                  const isSelected = field.state.value.includes(memberId);

                  return (
                    <Cell
                      Component="label"
                      key={memberId}
                      subtitle={
                        isSelected ? "Selected for exact split" : "Not selected"
                      }
                      before={
                        <ChatMemberAvatar userId={Number(memberId)} size={48} />
                      }
                      after={
                        <Checkbox
                          name="checkbox"
                          value={memberId}
                          onBlur={field.handleBlur}
                          checked={field.state.value.includes(memberId)}
                          onChange={(e) =>
                            field.handleChange((prev) => {
                              const currentParticipants = prev;
                              const isSelected = currentParticipants.includes(
                                e.target.value
                              );

                              if (isSelected) {
                                return currentParticipants.filter(
                                  (p) => p !== memberId
                                );
                              } else {
                                return [...currentParticipants, memberId];
                              }
                            })
                          }
                        />
                      }
                    >
                      {member.username
                        ? `@${member.username}`
                        : member.firstName}
                    </Cell>
                  );
                })}
              </Section>
              <div className="mt-3">
                <FieldInfo />
              </div>
            </section>
          )}
        </form.AppField>
      );
    }

    // Stage 2: Amount Input for Selected Members
    return (
      <div>
        <form.AppField name="customSplits">
          {(field) => {
            const handleAmountChange = (userId: string, value: string) => {
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
              const split = customSplits.find((s) => s.userId === userId);
              return split?.amount || "";
            };

            return (
              <Section
                header={
                  <div className="flex items-start justify-between">
                    <Section.Header large>Enter exact amounts</Section.Header>
                    <button
                      type="button"
                      style={{
                        color: tButtonColor,
                      }}
                      className="text-sm font-medium"
                      onClick={() => {
                        // Reset to stage 1 (member selection)
                        form.setFieldValue("exactSplitStage", "selection");
                        hapticFeedback.notificationOccurred("success");
                      }}
                    >
                      Change Members
                    </button>
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
                      (member) => Number(member.id).toString() === participantId
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
                                form.setFieldValue("participants", (prev) =>
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
                            amountInputRefs.current[memberId]?.scrollIntoView({
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
                              const activeElement = document.activeElement;
                              if (
                                activeElement?.tagName !== "INPUT" ||
                                !activeElement?.closest("[data-amount-input]")
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
    );
  },
});

export default SplitExactConfig;
