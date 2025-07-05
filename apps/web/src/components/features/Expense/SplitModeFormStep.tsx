import { useStartParams, withForm } from "@/hooks";
import { formOpts } from "./AddExpenseForm";
import { SplitModeType } from "./AddExpenseForm.type";
import {
  Input,
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
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import ChatMemberAvatar from "@/components/ui/ChatMemberAvatar";
import FieldInfo from "@/components/ui/FieldInfo";
import { useEffect } from "react";
import {
  Check,
  DollarSign,
  Percent,
  Equal,
  Pizza,
  ChevronUp,
} from "lucide-react";
import { cn } from "@utils/cn";
import { getRouteApi } from "@tanstack/react-router";
import { CardCell } from "@telegram-apps/telegram-ui/dist/components/Blocks/Card/components/CardCell/CardCell";
import ModalHeader from "@/components/ui/ModalHeader";
import Decimal from "decimal.js";
import {
  toDecimal,
  toNumber,
  sumDecimals,
  formatCurrency,
} from "@/utils/financial";

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

    const handleSplitModeChange = (mode: SplitModeType) => {
      form.setFieldValue("splitMode", mode);
      // Reset custom splits when changing mode
      form.setFieldValue("customSplits", []);
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
    const chatId = tStartParams?.chat_id ?? 0;

    const { data: chatMembers } = trpc.chat.getMembers.useQuery({ chatId });
    return (
      <form.AppField name="participants">
        {(field) => (
          <section>
            <Section
              header={<Section.Header large>Who is involved?</Section.Header>}
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
                const isPayee = memberId === form.state.values.payee;

                return (
                  <Cell
                    Component="label"
                    key={memberId}
                    subtitle={`${member?.firstName} ${member?.lastName || ""}`}
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
                    titleBadge={
                      isPayee ? <Badge type="number">Paid</Badge> : <></>
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
    const tStartParams = useStartParams();
    const chatId = tStartParams?.chat_id ?? 0;

    const { data: chatMembers } = trpc.chat.getMembers.useQuery({ chatId });
    return (
      <form.AppField name="participants">
        {(field) => (
          <section>
            <Section
              header={<Section.Header large>Who is involved?</Section.Header>}
            >
              {chatMembers?.map((member) => {
                const memberId = Number(member.id).toString();
                const isPayee = memberId === form.state.values.payee;

                return (
                  <Cell
                    Component="label"
                    key={memberId}
                    subtitle={`${member?.firstName} ${member?.lastName || ""}`}
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
                    titleBadge={
                      isPayee ? <Badge type="number">Paid</Badge> : <></>
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
        <form.Subscribe selector={(state) => state.values.splitMode}>
          {(splitMode) => (
            <Text weight="2">
              {splitMode === "EQUAL" && "Split equally"}
              {splitMode === "PERCENTAGE" && "Split by percentage"}
              {splitMode === "EXACT" && "Custom amounts"}
              {splitMode === "SHARES" && "Split by shares"}
            </Text>
          )}
        </form.Subscribe>
        <form.Subscribe selector={(state) => state.values.participants.length}>
          {(participantsCount) =>
            participantsCount > 0 && (
              <form.AppField name="customSplits">
                {(field) => (
                  <Modal
                    trigger={
                      <Chip after={<ChevronUp />}>
                        {field.state.value.length > 0
                          ? `${field.state.value.length} custom splits`
                          : "Configure"}
                      </Chip>
                    }
                    header={<ModalHeader>Split configuration</ModalHeader>}
                  >
                    <section className="px-4 pb-16 pt-1">
                      <form.Subscribe
                        selector={(state) => ({
                          splitMode: state.values.splitMode,
                          participants: state.values.participants,
                          amount: state.values.amount,
                          payee: state.values.payee,
                        })}
                      >
                        {(state) =>
                          state.splitMode === "EQUAL" && (
                            <SplitConfigEqual
                              participants={state.participants}
                              totalAmount={Number(state.amount) || 0}
                              chatMembers={chatMembers || []}
                              payeeId={state.payee}
                            />
                          )
                        }
                      </form.Subscribe>

                      <form.Subscribe
                        selector={(state) => ({
                          splitMode: state.values.splitMode,
                          participants: state.values.participants,
                          amount: state.values.amount,
                          payee: state.values.payee,
                        })}
                      >
                        {(state) =>
                          state.splitMode === "PERCENTAGE" && (
                            <SplitConfigPercentage
                              participants={state.participants}
                              totalAmount={Number(state.amount) || 0}
                              chatMembers={chatMembers || []}
                              customSplits={field.state.value}
                              onSplitsChange={(splits) =>
                                field.handleChange(splits)
                              }
                              payeeId={state.payee}
                            />
                          )
                        }
                      </form.Subscribe>

                      <form.Subscribe
                        selector={(state) => ({
                          splitMode: state.values.splitMode,
                          participants: state.values.participants,
                          amount: state.values.amount,
                          payee: state.values.payee,
                        })}
                      >
                        {(state) =>
                          state.splitMode === "EXACT" && (
                            <SplitConfigExact
                              participants={state.participants}
                              totalAmount={Number(state.amount) || 0}
                              chatMembers={chatMembers || []}
                              customSplits={field.state.value}
                              onSplitsChange={(splits) =>
                                field.handleChange(splits)
                              }
                              payeeId={state.payee}
                            />
                          )
                        }
                      </form.Subscribe>

                      <form.Subscribe
                        selector={(state) => ({
                          splitMode: state.values.splitMode,
                          participants: state.values.participants,
                          amount: state.values.amount,
                          payee: state.values.payee,
                        })}
                      >
                        {(state) =>
                          state.splitMode === "SHARES" && (
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
                          )
                        }
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

const SplitConfigEqual = ({
  participants,
  totalAmount,
  chatMembers,
  payeeId,
}: SplitConfigProps) => {
  const splitAmountDecimal =
    participants.length > 0
      ? toDecimal(totalAmount).dividedBy(participants.length)
      : new Decimal(0);

  return (
    <div className="space-y-3">
      {participants.map((participantId) => {
        const member = chatMembers.find(
          (m) => Number(m.id).toString() === participantId
        );
        const isPayee = participantId === payeeId;
        if (!member) return null;

        return (
          <div
            key={participantId}
            className={cn(
              "flex items-center justify-between rounded-xl p-3",
              isPayee
                ? "bg-yellow-500/10 ring-1 ring-yellow-500/30"
                : "bg-[#2a2a2a]"
            )}
          >
            <div className="flex items-center gap-3">
              <ChatMemberAvatar userId={Number(member.id)} size={40} />
              <div>
                <div className="font-medium text-white">
                  {member.firstName} {member.lastName}
                  {isPayee && (
                    <span className="ml-2 text-sm text-yellow-400">
                      👤 Paid
                    </span>
                  )}
                </div>
                {isPayee && (
                  <div className="text-xs text-gray-400">
                    Gets $
                    {toDecimal(totalAmount)
                      .minus(splitAmountDecimal)
                      .toFixed(2)}{" "}
                    back
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-lg font-semibold text-green-400">
                ${splitAmountDecimal.toFixed(2)}
              </div>
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500">
                <Check className="h-4 w-4 text-white" />
              </div>
            </div>
          </div>
        );
      })}

      {/* Summary Card */}
      <div className="mt-4 rounded-xl border border-green-500/20 bg-green-500/10 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Check className="h-5 w-5 text-green-400" />
            <span className="font-medium text-green-400">
              Equal split complete
            </span>
          </div>
          <div className="font-semibold text-white">
            ${splitAmountDecimal.toFixed(2)} each
          </div>
        </div>
      </div>
    </div>
  );
};

const SplitConfigShares = ({
  participants,
  totalAmount,
  chatMembers,
  customSplits = [],
  onSplitsChange,
  payeeId,
}: SplitConfigProps) => {
  const handleSharesChange = (userId: string, shares: string) => {
    const newSplits = [...customSplits];
    const existingIndex = newSplits.findIndex((s) => s.userId === userId);

    if (existingIndex >= 0) {
      newSplits[existingIndex] = { userId, amount: shares };
    } else {
      newSplits.push({ userId, amount: shares });
    }

    onSplitsChange?.(newSplits);
  };

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
      {participants.map((participantId) => {
        const member = chatMembers.find(
          (m) => Number(m.id).toString() === participantId
        );
        const currentSplit = customSplits.find(
          (s) => s.userId === participantId
        );
        const shares = currentSplit?.amount || "";
        const amount = toNumber(
          toDecimal(shares || "0").times(getAmountPerShare())
        );
        const isPayee = participantId === payeeId;

        if (!member) return null;

        return (
          <div
            key={participantId}
            className={cn(
              "flex items-center justify-between rounded-xl p-3",
              isPayee
                ? "bg-yellow-500/10 ring-1 ring-yellow-500/30"
                : "bg-[#2a2a2a]"
            )}
          >
            <div className="flex items-center gap-3">
              <ChatMemberAvatar userId={Number(member.id)} size={40} />
              <div>
                <div className="font-medium text-white">
                  {member.firstName} {member.lastName}
                  {isPayee && (
                    <span className="ml-2 text-sm text-yellow-400">
                      👤 Paid
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {hasShares && (
                    <div className="text-sm text-gray-400">
                      ${amount.toFixed(2)}
                    </div>
                  )}
                  {isPayee && amount > 0 && (
                    <div className="text-xs text-gray-400">
                      Gets ${toDecimal(totalAmount).minus(amount).toFixed(2)}{" "}
                      back
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                placeholder="1"
                before={"🍌"}
                value={shares}
                onChange={(e) =>
                  handleSharesChange(participantId, e.target.value)
                }
                className="w-20 border-gray-600 bg-[#1a1a1a] text-center text-white"
                min="0"
              />
            </div>
          </div>
        );
      })}

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

const SplitConfigPercentage = ({
  participants,
  totalAmount,
  chatMembers,
  customSplits = [],
  onSplitsChange,
  payeeId,
}: SplitConfigProps) => {
  const handlePercentageChange = (userId: string, percentage: string) => {
    const newSplits = [...customSplits];
    const existingIndex = newSplits.findIndex((s) => s.userId === userId);

    if (existingIndex >= 0) {
      newSplits[existingIndex] = { userId, amount: percentage };
    } else {
      newSplits.push({ userId, amount: percentage });
    }

    onSplitsChange?.(newSplits);
  };

  const getTotalPercentage = () => {
    const amounts = customSplits.map((split) => split.amount || "0");
    return toNumber(sumDecimals(amounts));
  };

  const getRemainingPercentage = () => {
    return toNumber(new Decimal(100).minus(getTotalPercentage()));
  };

  const totalPercentageDecimal = sumDecimals(
    customSplits.map((split) => split.amount || "0")
  );
  const isValid = totalPercentageDecimal.equals(100);
  const isOverAllocated = totalPercentageDecimal.greaterThan(100);

  return (
    <div className="space-y-3">
      {participants.map((participantId) => {
        const member = chatMembers.find(
          (m) => Number(m.id).toString() === participantId
        );
        const currentSplit = customSplits.find(
          (s) => s.userId === participantId
        );
        const percentage = currentSplit?.amount || "";
        const dollarAmount = toNumber(
          toDecimal(percentage || "0")
            .dividedBy(100)
            .times(totalAmount)
        );
        const isPayee = participantId === payeeId;

        if (!member) return null;

        return (
          <div
            key={participantId}
            className={cn(
              "flex items-center justify-between rounded-xl p-3",
              isPayee
                ? "bg-yellow-500/10 ring-1 ring-yellow-500/30"
                : "bg-[#2a2a2a]"
            )}
          >
            <div className="flex items-center gap-3">
              <ChatMemberAvatar userId={Number(member.id)} size={40} />
              <div>
                <div className="font-medium text-white">
                  {member.firstName} {member.lastName}
                  {isPayee && (
                    <span className="ml-2 text-sm text-yellow-400">
                      👤 Paid
                    </span>
                  )}
                </div>
                {isPayee && dollarAmount > 0 && (
                  <div className="text-xs text-gray-400">
                    Gets $
                    {toDecimal(totalAmount).minus(dollarAmount).toFixed(2)} back
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Input
                    type="number"
                    placeholder="0"
                    value={percentage}
                    onChange={(e) =>
                      handlePercentageChange(participantId, e.target.value)
                    }
                    className="w-20 border-gray-600 bg-[#1a1a1a] pr-8 text-right text-white"
                    min="0"
                    max="100"
                  />
                  <Percent className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 transform text-gray-400" />
                </div>
                <div className="min-w-[60px] text-right text-sm text-gray-400">
                  ${dollarAmount.toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* Progress Bar */}
      <div className="mt-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Progress</span>
          <span
            className={cn(
              "font-medium",
              isValid
                ? "text-green-400"
                : isOverAllocated
                  ? "text-red-400"
                  : "text-yellow-400"
            )}
          >
            {toNumber(totalPercentageDecimal)}% / 100%
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[#2a2a2a]">
          <div
            className={cn(
              "h-full transition-all duration-300",
              isValid
                ? "bg-green-500"
                : isOverAllocated
                  ? "bg-red-500"
                  : "bg-yellow-500"
            )}
            style={{
              width: `${Math.min(toNumber(totalPercentageDecimal), 100)}%`,
            }}
          />
        </div>
      </div>

      {/* Summary Card */}
      <div
        className={cn(
          "mt-4 rounded-xl border p-4",
          isValid
            ? "border-green-500/20 bg-green-500/10"
            : isOverAllocated
              ? "border-red-500/20 bg-red-500/10"
              : "border-yellow-500/20 bg-yellow-500/10"
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Percent
              className={cn(
                "h-5 w-5",
                isValid
                  ? "text-green-400"
                  : isOverAllocated
                    ? "text-red-400"
                    : "text-yellow-400"
              )}
            />
            <span
              className={cn(
                "font-medium",
                isValid
                  ? "text-green-400"
                  : isOverAllocated
                    ? "text-red-400"
                    : "text-yellow-400"
              )}
            >
              {isValid
                ? "Perfect split!"
                : isOverAllocated
                  ? "Over-allocated"
                  : `${getRemainingPercentage()}% remaining`}
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

const SplitConfigExact = ({
  participants,
  totalAmount,
  chatMembers,
  customSplits = [],
  onSplitsChange,
  payeeId,
}: SplitConfigProps) => {
  const handleAmountChange = (userId: string, amount: string) => {
    const newSplits = [...customSplits];
    const existingIndex = newSplits.findIndex((s) => s.userId === userId);

    if (existingIndex >= 0) {
      newSplits[existingIndex] = { userId, amount };
    } else {
      newSplits.push({ userId, amount });
    }

    onSplitsChange?.(newSplits);
  };

  const remainingAmountDecimal = toDecimal(totalAmount).minus(
    sumDecimals(customSplits.map((split) => split.amount || "0"))
  );
  const isValid = remainingAmountDecimal.abs().lessThan(0.01);
  const isOverAllocated = remainingAmountDecimal.lessThan(-0.01);

  return (
    <div className="space-y-3">
      {participants.map((participantId) => {
        const member = chatMembers.find(
          (m) => Number(m.id).toString() === participantId
        );
        const currentSplit = customSplits.find(
          (s) => s.userId === participantId
        );
        const amount = currentSplit?.amount || "";
        const dollarAmount = toNumber(toDecimal(amount || "0"));
        const isPayee = participantId === payeeId;

        if (!member) return null;

        return (
          <div
            key={participantId}
            className={cn(
              "flex items-center justify-between rounded-xl p-3",
              isPayee
                ? "bg-yellow-500/10 ring-1 ring-yellow-500/30"
                : "bg-[#2a2a2a]"
            )}
          >
            <div className="flex items-center gap-3">
              <ChatMemberAvatar userId={Number(member.id)} size={40} />
              <div>
                <div className="font-medium text-white">
                  {member.firstName} {member.lastName}
                  {isPayee && (
                    <span className="ml-2 text-sm text-yellow-400">
                      👤 Paid
                    </span>
                  )}
                </div>
                {isPayee && dollarAmount > 0 && (
                  <div className="text-xs text-gray-400">
                    Gets $
                    {toDecimal(totalAmount).minus(dollarAmount).toFixed(2)} back
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Input
                  type="number"
                  placeholder="0.00"
                  before={<DollarSign />}
                  value={amount}
                  onChange={(e) =>
                    handleAmountChange(participantId, e.target.value)
                  }
                  className="w-30"
                  min="0"
                  step="0.01"
                />
              </div>
            </div>
          </div>
        );
      })}

      {/* Progress Indicator */}
      <div className="mt-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Allocation Progress</span>
          <span
            className={cn(
              "font-medium",
              isValid
                ? "text-green-400"
                : isOverAllocated
                  ? "text-red-400"
                  : "text-yellow-400"
            )}
          >
            $
            {sumDecimals(
              customSplits.map((split) => split.amount || "0")
            ).toFixed(2)}{" "}
            / ${toDecimal(totalAmount).toFixed(2)}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[#2a2a2a]">
          <div
            className={cn(
              "h-full transition-all duration-300",
              isValid
                ? "bg-green-500"
                : isOverAllocated
                  ? "bg-red-500"
                  : "bg-yellow-500"
            )}
            style={{
              width: `${Math.min(
                toNumber(
                  sumDecimals(customSplits.map((split) => split.amount || "0"))
                    .dividedBy(totalAmount)
                    .times(100)
                ),
                100
              )}%`,
            }}
          />
        </div>
      </div>

      {/* Summary Card */}
      <div
        className={cn(
          "mt-4 rounded-xl border p-4",
          isValid
            ? "border-green-500/20 bg-green-500/10"
            : isOverAllocated
              ? "border-red-500/20 bg-red-500/10"
              : "border-yellow-500/20 bg-yellow-500/10"
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign
              className={cn(
                "h-5 w-5",
                isValid
                  ? "text-green-400"
                  : isOverAllocated
                    ? "text-red-400"
                    : "text-yellow-400"
              )}
            />
            <span
              className={cn(
                "font-medium",
                isValid
                  ? "text-green-400"
                  : isOverAllocated
                    ? "text-red-400"
                    : "text-yellow-400"
              )}
            >
              {isValid
                ? "Perfect split!"
                : isOverAllocated
                  ? "Over-allocated"
                  : `$${remainingAmountDecimal.toFixed(2)} remaining`}
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
