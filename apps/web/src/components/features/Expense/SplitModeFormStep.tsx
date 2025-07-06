import { useStartParams, withForm } from "@/hooks";
import { formOpts } from "./AddExpenseForm";
import { SplitModeType } from "./AddExpenseForm.type";
import {
  Caption,
  Section,
  Cell,
  Checkbox,
  Badge,
  Modal,
  Chip,
  Text,
  Info,
} from "@telegram-apps/telegram-ui";
import { trpc } from "@/utils/trpc";
import {
  hapticFeedback,
  mainButton,
  popup,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import ChatMemberAvatar from "@/components/ui/ChatMemberAvatar";
import FieldInfo from "@/components/ui/FieldInfo";
import { Equal, Pizza, Plus, Minus } from "lucide-react";
import { cn } from "@utils/cn";
import { getRouteApi } from "@tanstack/react-router";
import { CardCell } from "@telegram-apps/telegram-ui/dist/components/Blocks/Card/components/CardCell/CardCell";
import ModalHeader from "@/components/ui/ModalHeader";
import {
  toDecimal,
  toNumber,
  sumDecimals,
  formatCurrency,
} from "@/utils/financial";
import { useStore } from "@tanstack/react-form";
import { useState, useEffect } from "react";

const routeApi = getRouteApi("/_tma/chat/$chatId_/add-expense");

const SPLIT_MODE_OPTIONS: {
  value: SplitModeType;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    value: "EQUAL",
    label: "Equal",
    description: "Amount split equally among participants",
    icon: <Equal size={20} />,
  },
  {
    value: "SHARES",
    label: "Shares",
    description: "Amount split based on shares assigned",
    icon: <Pizza size={20} />,
  },
  // {
  //   value: "PERCENTAGE",
  //   label: "Percent",
  //   description: "Split based on percentage assigned",
  //   icon: <Percent size={20}/>,
  // },
  // {
  //   value: "EXACT",
  //   label: "Exact",
  //   description: "Custom amounts",
  //   icon: <DollarSign size={20} />,
  // },
] as const;

const SplitModeFormStep = withForm({
  ...formOpts,
  props: {
    step: 2,
    isLastStep: true,
  },
  render: function Render({ form, isLastStep, step }) {
    const navigate = routeApi.useNavigate();

    // Configure main button click
    useEffect(() => {
      const offClick = mainButton.onClick.ifAvailable(() => {
        form.validateSync("change");
        form.setFieldMeta("splitMode", (prev) => ({
          ...prev,
          isTouched: true,
        }));
        form.setFieldMeta("participants", (prev) => ({
          ...prev,
          isTouched: true,
        }));

        const hasErrors = Object.values(form.state.fieldMeta).some(
          (meta) => meta.errors.length > 0
        );

        if (hasErrors) {
          return hapticFeedback.notificationOccurred("warning");
        }
        hapticFeedback.notificationOccurred("success");

        // Submit form if last step
        if (isLastStep) {
          mainButton.setParams.ifAvailable({
            isLoaderVisible: true,
          });
          form.handleSubmit();
        } else {
          navigate({
            search: (prev) => ({
              ...prev,
              currentFormStep: step + 1,
            }),
          });
        }
      });

      return () => {
        offClick?.();
      };
    }, [step, form, navigate, isLastStep]);

    const handleSplitModeChange = async (mode: SplitModeType) => {
      // Ask for confirmation if participants or custom splits are dirty
      const { isDirty: isParticipantsDirty } =
        form.getFieldMeta("participants") ?? {};
      const { isDirty: isCustomSplitsDirty } =
        form.getFieldMeta("customSplits") ?? {};
      if (isCustomSplitsDirty || isParticipantsDirty) {
        const id = await popup.open({
          title: "Change split mode",
          message:
            "This will reset your current split configuration. Are you sure?",
          buttons: [
            {
              text: "Yes",
              id: "confirm",
              type: "destructive",
            },
            {
              type: "cancel",
            },
          ],
        });
        if (id !== "confirm") {
          return;
        }
      }

      // Reset participants and custom splits when changing split mode
      form.setFieldValue("splitMode", mode);
      form.setFieldValue("participants", []);
      form.setFieldValue("customSplits", []);

      // Reset field meta for participants and custom splits
      form.setFieldMeta("participants", (prev) => ({
        ...prev,
        isDirty: false,
        isTouched: false,
      }));
      form.setFieldMeta("customSplits", (prev) => ({
        ...prev,
        isDirty: false,
        isTouched: false,
      }));
    };

    return (
      <div className="flex flex-col gap-6">
        {/* Split Mode Selection */}
        <form.AppField name="splitMode">
          {(field) => (
            <section className="flex flex-col">
              <Section.Header large>Split by?</Section.Header>
              <fieldset className="grid grid-cols-2 gap-2.5" role="radiogroup">
                {SPLIT_MODE_OPTIONS.map(
                  ({ description, icon, label, value }, index) => {
                    const isSelected = field.state.value === value;
                    const isFirstOption = index === 0;
                    const shouldBeTabbable =
                      isSelected || (!field.state.value && isFirstOption);

                    return (
                      <div key={value} className="relative">
                        <input
                          type="radio"
                          id={`split-mode-${value}`}
                          name="splitMode"
                          value={value}
                          checked={isSelected}
                          onChange={() => handleSplitModeChange(value)}
                          className="sr-only"
                        />
                        <CardCell
                          readOnly
                          subtitle={<Caption>{description}</Caption>}
                          subhead={icon}
                          role="radio"
                          aria-checked={isSelected}
                          aria-describedby={`split-mode-${value}-desc`}
                          tabIndex={shouldBeTabbable ? 0 : -1}
                          className={cn(
                            "cursor-pointer rounded-lg transition-all",
                            "focus:outline-2 focus:outline-offset-2 focus:outline-blue-500",
                            isSelected &&
                              "outline-2 outline-offset-2 outline-blue-500/30"
                          )}
                          onClick={() => handleSplitModeChange(value)}
                        >
                          {label}
                        </CardCell>
                        <div
                          id={`split-mode-${value}-desc`}
                          className="sr-only"
                        >
                          {description}
                        </div>
                      </div>
                    );
                  }
                )}
              </fieldset>
            </section>
          )}
        </form.AppField>

        {/* Split Mode Configuration */}
        <form.Subscribe
          selector={(state) => ({
            splitMode: state.values.splitMode,
          })}
        >
          {({ splitMode }) => {
            const ConfigComponent = {
              EQUAL: SplitEqualConfig,
              SHARES: SplitShareConfig,
            }[splitMode as "EQUAL" | "SHARES"];

            return (
              <ConfigComponent
                form={form}
                step={step}
                isLastStep={isLastStep}
              />
            );
          }}
        </form.Subscribe>

        {/* Configuration footer */}
        <form.Subscribe
          selector={(state) => ({
            splitMode: state.values.splitMode,
          })}
        >
          {({ splitMode }) => {
            const FooterComponent = {
              EQUAL: SplitEqualFooter,
              SHARES: SplitShareFooter,
            }[splitMode as "EQUAL" | "SHARES"];

            return <FooterComponent form={form} step={step} isLastStep />;
          }}
        </form.Subscribe>
      </div>
    );
  },
});

// Split Configuration Components
const SplitEqualConfig = withForm({
  ...formOpts,
  props: {
    step: 2,
    isLastStep: true,
  },
  render: function Render({ form }) {
    const tStartParams = useStartParams();
    const tSubtitleTextColor = useSignal(themeParams.subtitleTextColor);

    const chatId = tStartParams?.chat_id ?? 0;

    const { data: chatMembers } = trpc.chat.getMembers.useQuery({ chatId });

    const payerData = chatMembers?.find(
      (member) => member.id === BigInt(form.state.values.payee)
    );

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
                const splitAmount =
                  form.state.values.amount &&
                  toDecimal(form.state.values.amount)
                    .dividedBy(field.state.value.length || 1)
                    .toFixed(2);

                return (
                  <Cell
                    Component="label"
                    key={memberId}
                    subtitle={
                      <Caption weight={isSelected ? "2" : "3"}>
                        {isSelected
                          ? formatCurrency(Number(splitAmount))
                          : "Not selected"}
                      </Caption>
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
                    @{member?.username || "Unknown"}{" "}
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
  },
});

const SplitEqualFooter = withForm({
  ...formOpts,
  props: {
    step: 2,
    isLastStep: true,
  },
  render: function Render({ form }) {
    const tSectionBgColor = useSignal(themeParams.sectionBackgroundColor);

    return (
      <footer
        className="fixed bottom-0 left-0 right-0 z-10"
        style={{
          backgroundColor: tSectionBgColor,
        }}
      >
        <Cell
          after={
            <form.Subscribe
              selector={(state) => ({
                participants: state.values.participants,
                amount: state.values.amount,
              })}
            >
              {({ participants, amount }) => {
                const splitAmount = toDecimal(amount || "0").dividedBy(
                  participants.length || 1
                );

                if (participants.length === 0) {
                  return null;
                }
                return (
                  <Info type="text" subtitle="each">
                    {formatCurrency(toNumber(splitAmount))}
                  </Info>
                );
              }}
            </form.Subscribe>
          }
          subtitle={
            <form.Subscribe
              selector={(state) => ({
                participants: state.values.participants,
              })}
            >
              {({ participants }) =>
                participants.length > 0 ? (
                  <Caption>
                    {participants.length > 1
                      ? `${participants.length} members selected`
                      : `${participants.length} member selected`}
                  </Caption>
                ) : (
                  <Caption>No members selected</Caption>
                )
              }
            </form.Subscribe>
          }
        >
          <Text weight="2">Split equally</Text>
        </Cell>
      </footer>
    );
  },
});

const SplitShareConfig = withForm({
  ...formOpts,
  props: {
    step: 2,
    isLastStep: true,
  },
  render: function Render({ form }) {
    const tButtonColor = useSignal(themeParams.buttonColor);
    const tButtonTextColor = useSignal(themeParams.buttonTextColor);
    const tSubtitleTextColor = useSignal(themeParams.subtitleTextColor);
    const tDesctructiveTextColor = useSignal(themeParams.destructiveTextColor);
    const tStartParams = useStartParams();
    const chatId = tStartParams?.chat_id ?? 0;
    const { customSplits } = useStore(form.store, (state) => ({
      customSplits: state.values.customSplits,
    }));

    const { data: chatMembers } = trpc.chat.getMembers.useQuery({ chatId });

    const payerData = chatMembers?.find(
      (member) => member.id === BigInt(form.state.values.payee)
    );

    const [badgeAnimations, setBadgeAnimations] = useState<
      Record<string, "idle" | "pop" | "shake">
    >({});

    const triggerBadgeAnimation = (userId: string, type: "pop" | "shake") => {
      setBadgeAnimations((prev) => ({ ...prev, [userId]: type }));
      setTimeout(
        () => {
          setBadgeAnimations((prev) => ({ ...prev, [userId]: "idle" }));
        },
        type === "pop" ? 200 : 250
      );
    };

    return (
      <form.AppField name="customSplits">
        {(field) => {
          const handleSharesChange = (
            userId: string,
            shares: string,
            isIncrement?: boolean
          ) => {
            if (shares === "0") {
              form.setFieldValue("participants", (prev) => {
                return prev.filter((p) => p !== userId);
              });
            }

            if (shares === "1") {
              form.setFieldValue("participants", (prev) => {
                if (!prev.includes(userId)) {
                  return [...prev, userId];
                }
                return prev;
              });
            }

            const newSplits = [...customSplits];
            const existingIndex = newSplits.findIndex(
              (s) => s.userId === userId
            );

            if (existingIndex >= 0) {
              newSplits[existingIndex] = { userId, amount: shares };
            } else {
              newSplits.push({ userId, amount: shares });
            }

            field.handleChange(newSplits);

            // Trigger animation if shares > 0
            if (shares !== "0" && isIncrement !== undefined) {
              triggerBadgeAnimation(userId, isIncrement ? "pop" : "shake");
            }
          };
          return (
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
                {chatMembers?.map((member) => {
                  const memberId = Number(member.id).toString();

                  const shares =
                    customSplits.find((s) => s.userId === memberId)?.amount ||
                    "0";
                  return (
                    <Cell
                      key={memberId}
                      subtitle={`${member?.firstName} ${member?.lastName || ""}`}
                      before={
                        <div className="relative">
                          <div
                            className={cn(
                              "absolute -right-3 -top-1 z-10",
                              shares === "0" ? "invisible" : "",
                              badgeAnimations[memberId] === "pop" &&
                                "animate-badge-pop",
                              badgeAnimations[memberId] === "shake" &&
                                "animate-badge-shake"
                            )}
                          >
                            <Badge type="number">{shares}</Badge>
                          </div>
                          <ChatMemberAvatar
                            userId={Number(memberId)}
                            size={48}
                          />
                        </div>
                      }
                      after={
                        <div className="flex items-center gap-1">
                          <button
                            style={{
                              backgroundColor: tDesctructiveTextColor,
                              color: tButtonTextColor,
                            }}
                            className={cn(
                              "flex h-8 w-10 items-center justify-center rounded-lg p-1 transition-[width] duration-200",
                              shares === "0" ? "invisible w-0" : "w-10"
                            )}
                            onClick={() => {
                              if (shares === "0") return;
                              hapticFeedback.impactOccurred("medium");
                              handleSharesChange(
                                memberId,
                                (Number(shares) - 1).toString(),
                                false
                              );
                            }}
                          >
                            <Minus size={22} strokeWidth={3} />
                          </button>
                          <button
                            style={{
                              backgroundColor: tButtonColor,
                              color: tButtonTextColor,
                            }}
                            className={cn(
                              "flex h-8 items-center justify-center rounded-lg p-1 transition-[width] duration-200",
                              shares === "0" ? "w-20" : "w-10"
                            )}
                            onClick={() => {
                              hapticFeedback.impactOccurred("medium");
                              handleSharesChange(
                                memberId,
                                (Number(shares) + 1).toString(),
                                true
                              );
                            }}
                          >
                            {shares === "0" ? (
                              <Text weight="2">Add</Text>
                            ) : (
                              <Plus size={22} strokeWidth={3} />
                            )}
                          </button>
                        </div>
                      }
                    >
                      @{member?.username || "Unknown"}{" "}
                    </Cell>
                  );
                })}
              </Section>
              <form.AppField name="participants">
                {() => (
                  <div className="mt-3">
                    <FieldInfo />
                  </div>
                )}
              </form.AppField>
            </section>
          );
        }}
      </form.AppField>
    );
  },
});

const SplitShareFooter = withForm({
  ...formOpts,
  props: {
    step: 2,
    isLastStep: true,
  },
  render: function Render({ form }) {
    const tSectionBgColor = useSignal(themeParams.sectionBackgroundColor);
    const tStartParams = useStartParams();
    const chatId = tStartParams?.chat_id ?? 0;

    const { data: chatMembers } = trpc.chat.getMembers.useQuery({ chatId });
    return (
      <footer
        className="fixed bottom-0 left-0 right-0 z-10 flex items-center justify-between py-3 pe-3 ps-5"
        style={{
          backgroundColor: tSectionBgColor,
        }}
      >
        <Text weight="2">Split by shares</Text>

        <form.Subscribe selector={(state) => state.values.participants.length}>
          {(participantsCount) =>
            participantsCount > 0 && (
              <form.AppField name="customSplits">
                {(field) => (
                  <Modal
                    trigger={<Chip>Details</Chip>}
                    header={<ModalHeader>Split configuration</ModalHeader>}
                  >
                    <section className="px-4 pb-16 pt-1">
                      <form.Subscribe
                        selector={(state) => ({
                          participants: state.values.participants,
                          amount: state.values.amount,
                          payee: state.values.payee,
                        })}
                      >
                        {(state) => (
                          <SplitConfigShares
                            participants={state.participants}
                            totalAmount={Number(state.amount) || 0}
                            chatMembers={chatMembers || []}
                            customSplits={field.state.value}
                            onSplitsChange={(splits) =>
                              field.handleChange(splits)
                            }
                            payeeId={state.payee}
                          />
                        )}
                      </form.Subscribe>
                    </section>

                    <div className="mt-4">
                      <FieldInfo />
                    </div>
                  </Modal>
                )}
              </form.AppField>
            )
          }
        </form.Subscribe>
      </footer>
    );
  },
});

interface SplitConfigProps {
  participants: string[];
  totalAmount: number;
  chatMembers: { id: bigint; firstName: string; lastName: string | null }[];
  customSplits?: { userId: string; amount: string }[];
  onSplitsChange?: (splits: { userId: string; amount: string }[]) => void;
  payeeId: string;
}

const SplitConfigShares = ({
  participants,
  totalAmount,
  customSplits = [],
}: SplitConfigProps) => {
  const getTotalShares = () => {
    const amounts = customSplits.map((split) => split.amount || "0");
    return toNumber(sumDecimals(amounts));
  };

  const getAmountPerShare = () => {
    const totalSharesDecimal = sumDecimals(
      customSplits.map((split) => split.amount || "0")
    );
    return totalSharesDecimal.greaterThan(0)
      ? toNumber(toDecimal(totalAmount).dividedBy(totalSharesDecimal))
      : 0;
  };

  const hasShares = getTotalShares() > 0;

  return (
    <div className="space-y-3">
      {/* Shares Visualization */}
      {hasShares && (
        <div className="mt-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Share Distribution</span>
            <span className="font-medium text-white">
              {getTotalShares()} total shares
            </span>
          </div>
          <div className="flex h-2 gap-1">
            {participants.map((participantId) => {
              const currentSplit = customSplits.find(
                (s) => s.userId === participantId
              );
              const sharesDecimal = toDecimal(currentSplit?.amount || "0");
              const totalSharesDecimal = sumDecimals(
                customSplits.map((split) => split.amount || "0")
              );
              const percentage = totalSharesDecimal.greaterThan(0)
                ? toNumber(sharesDecimal.dividedBy(totalSharesDecimal))
                : 0;
              const shares = toNumber(sharesDecimal);

              if (shares === 0) return null;

              return (
                <div
                  key={participantId}
                  className="h-full rounded-sm bg-blue-500"
                  style={{ width: `${percentage * 100}%` }}
                  title={`${shares} shares`}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Summary Card */}
      <div
        className={cn(
          "mt-4 rounded-xl border p-4",
          hasShares
            ? "border-blue-500/20 bg-blue-500/10"
            : "border-gray-500/20 bg-gray-500/10"
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded border-2",
                hasShares ? "border-blue-400 bg-blue-400" : "border-gray-400"
              )}
            >
              <span className="text-xs font-bold text-white">
                {hasShares ? getTotalShares() : "?"}
              </span>
            </div>
            <span
              className={cn(
                "font-medium",
                hasShares ? "text-blue-400" : "text-gray-400"
              )}
            >
              {hasShares
                ? `$${getAmountPerShare().toFixed(2)} per share`
                : "Set shares to calculate"}
            </span>
          </div>
          <div className="font-semibold text-white">
            ${toDecimal(totalAmount).toFixed(2)} total
          </div>
        </div>
      </div>
    </div>
  );
};

export default SplitModeFormStep;
