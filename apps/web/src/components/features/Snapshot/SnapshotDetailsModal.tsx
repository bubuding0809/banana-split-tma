import {
  Modal,
  Title,
  Cell,
  Section,
  Caption,
  Text,
  IconButton,
  Skeleton,
  Info,
} from "@telegram-apps/telegram-ui";
import { trpc } from "@/utils/trpc";
import {
  hapticFeedback,
  themeParams,
  useSignal,
  popup,
  secondaryButton,
  initData,
} from "@telegram-apps/sdk-react";
import { X, FileText, User, TrendingDown } from "lucide-react";
import { formatCurrencyWithCode } from "@/utils/financial";
import { formatExpenseDateShort } from "@/utils/date";
import ChatMemberAvatar from "@/components/ui/ChatMemberAvatar";
import { useCallback, useRef, useEffect } from "react";

interface SnapshotDetailsModalProps {
  snapshotId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SnapshotDetailsModal = ({
  snapshotId,
  open,
  onOpenChange,
}: SnapshotDetailsModalProps) => {
  const tSubtitleTextColor = useSignal(themeParams.subtitleTextColor);
  const tButtonColor = useSignal(themeParams.buttonColor);
  const tDesctructiveTextColor = useSignal(themeParams.destructiveTextColor);
  const tUserData = useSignal(initData.user);

  const offSecondaryButtonClickRef = useRef<VoidFunction | undefined>(
    undefined
  );

  const trpcUtils = trpc.useUtils();

  // Cleanup secondary button when the component unmounts
  useEffect(() => {
    return () => {
      secondaryButton.setParams({
        isVisible: false,
        isEnabled: false,
      });

      offSecondaryButtonClickRef.current?.();
    };
  }, []);

  const { data: snapshot, isLoading } = trpc.snapshot.getDetails.useQuery(
    {
      snapshotId,
    },
    {
      enabled: open,
    }
  );

  const deleteSnapshotMutation = trpc.snapshot.delete.useMutation({
    onSuccess: () => {
      trpcUtils.snapshot.getByChat.invalidate();
      hapticFeedback.notificationOccurred("success");
      onOpenChange(false);
    },
    onError: (error) => {
      hapticFeedback.notificationOccurred("error");
      console.error("Failed to delete snapshot:", error);
    },
  });

  const handleDelete = useCallback(async () => {
    const action = await popup.open.ifAvailable({
      title: "Delete Snapshot?",
      message:
        "This action cannot be undone. The snapshot will be permanently removed.",
      buttons: [
        {
          type: "destructive",
          text: "Delete",
          id: "delete-snapshot",
        },
        {
          type: "cancel",
        },
      ],
    });

    if (action === "delete-snapshot") {
      secondaryButton.setParams({
        isLoaderVisible: true,
        isEnabled: false,
      });

      try {
        await deleteSnapshotMutation.mutateAsync({
          snapshotId,
        });
      } catch (error) {
        console.log("Error deleting snapshot %o", error);
      } finally {
        secondaryButton.setParams({
          isLoaderVisible: false,
          isEnabled: true,
        });
      }
    }
  }, [deleteSnapshotMutation, snapshotId]);

  const handleOpenChange = (open: boolean) => {
    if (open) {
      secondaryButton.setParams({
        text: "Delete",
        isVisible: true,
        isEnabled: true,
        textColor: tDesctructiveTextColor,
      });
      offSecondaryButtonClickRef.current =
        secondaryButton.onClick(handleDelete);
    } else {
      secondaryButton.setParams({
        isVisible: false,
        isEnabled: false,
        textColor: tButtonColor,
      });
      offSecondaryButtonClickRef.current?.();
    }

    onOpenChange(open);
  };

  if (isLoading || !snapshot) {
    return (
      <Modal open={open} onOpenChange={handleOpenChange}>
        <div className="px-4 py-6">
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} visible>
                <div className="h-16 w-full rounded bg-gray-200" />
              </Skeleton>
            ))}
          </div>
        </div>
      </Modal>
    );
  }

  // Calculate participant summary
  const participantSummary = new Map<
    number,
    {
      name: string;
      totalPaid: number;
      totalOwed: number;
    }
  >();

  snapshot.expenses.forEach((expense) => {
    const payerId = expense.payerId;
    const payerName = expense.payer.firstName;

    if (!participantSummary.has(payerId)) {
      participantSummary.set(payerId, {
        name: payerName,
        totalPaid: 0,
        totalOwed: 0,
      });
    }

    const payerSummary = participantSummary.get(payerId)!;
    payerSummary.totalPaid += expense.amount;

    // Add amounts owed by each participant
    expense.shares.forEach((share) => {
      if (share.amount && share.userId !== payerId) {
        if (!participantSummary.has(share.userId)) {
          participantSummary.set(share.userId, {
            name: share.user.firstName,
            totalPaid: 0,
            totalOwed: 0,
          });
        }
        const borrowerSummary = participantSummary.get(share.userId)!;
        borrowerSummary.totalOwed += share.amount;
      }
    });
  });

  // Calculate total damage for the main user (net sum of share amounts)
  const mainUserId = tUserData?.id;
  let totalDamageForMainUser = 0;

  if (mainUserId) {
    snapshot.expenses.forEach((expense) => {
      expense.shares.forEach((share) => {
        if (share.userId === mainUserId && share.amount) {
          totalDamageForMainUser += share.amount;
        }
      });
    });
  }

  return (
    <Modal
      open={open}
      onOpenChange={handleOpenChange}
      header={
        <Modal.Header
          before={
            <Title level="3" weight="1">
              Snapshot Details
            </Title>
          }
          after={
            <Modal.Close>
              <IconButton size="s" mode="gray">
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
      <div className="max-h-[70vh]">
        {/* Header Information */}
        <Section>
          <Cell
            before={
              <span className="rounded-lg bg-purple-500 p-1.5">
                <FileText size={20} color="white" />
              </span>
            }
          >
            <Text weight="3" className="text-lg">
              {snapshot.title}
            </Text>
          </Cell>

          <Cell
            before={<User size={16} className="text-gray-400" />}
            after={
              <Caption>
                {new Date(snapshot.createdAt).toLocaleDateString()}
              </Caption>
            }
          >
            <Caption>Created by {snapshot.creator.firstName}</Caption>
          </Cell>
        </Section>

        {/* Total Damage for Main User */}
        {mainUserId && totalDamageForMainUser > 0 && (
          <Section header="Your Total Damage" className="mt-4">
            <Cell
              before={
                <span className="rounded-lg bg-red-500 p-1.5">
                  <TrendingDown size={20} color="white" />
                </span>
              }
              after={
                <Text weight="3" className="text-lg text-red-600">
                  {formatCurrencyWithCode(
                    totalDamageForMainUser,
                    snapshot.currency
                  )}
                </Text>
              }
              description="Total damage among expenses"
            >
              <Text weight="2">Amount you spent</Text>
            </Cell>
          </Section>
        )}

        {/* Participant Breakdown */}
        <Section header="Participant Summary" className="mt-4">
          {Array.from(participantSummary.entries()).map(([userId, summary]) => {
            const netAmount = summary.totalPaid - summary.totalOwed;
            return (
              <Cell
                key={userId}
                before={<ChatMemberAvatar userId={userId} size={40} />}
                description={
                  <Caption>
                    Paid:{" "}
                    {formatCurrencyWithCode(
                      summary.totalPaid,
                      snapshot.currency
                    )}
                    {summary.totalOwed > 0 && (
                      <>
                        {" "}
                        • Owes:{" "}
                        {formatCurrencyWithCode(
                          summary.totalOwed,
                          snapshot.currency
                        )}
                      </>
                    )}
                  </Caption>
                }
                after={
                  <Info
                    type="text"
                    subtitle={netAmount >= 0 ? "To receive" : "To pay"}
                  >
                    <Text
                      weight="2"
                      className={
                        netAmount >= 0 ? "text-green-600" : "text-red-600"
                      }
                    >
                      {formatCurrencyWithCode(
                        Math.abs(netAmount),
                        snapshot.currency
                      )}
                    </Text>
                  </Info>
                }
              >
                <Text weight="2">{summary.name}</Text>
              </Cell>
            );
          })}
        </Section>

        {/* Expenses List */}
        <Section header="Included Expenses" className="mt-4">
          {snapshot.expenses.map((expense) => (
            <Cell
              key={expense.id}
              before={<ChatMemberAvatar userId={expense.payerId} size={48} />}
              subhead={
                <Caption weight="1" level="1">
                  {expense.payer.firstName} spent
                </Caption>
              }
              description={expense.description}
              after={
                <Info
                  avatarStack={
                    <Info type="text">
                      <div className="flex flex-col items-end gap-1.5">
                        <Caption className="w-max" weight="2">
                          {formatExpenseDateShort(new Date(expense.createdAt))}
                        </Caption>
                        <Text weight="3">
                          {formatCurrencyWithCode(
                            expense.amount,
                            expense.currency
                          )}
                        </Text>
                        <Caption className="w-max">
                          {expense.shares.length} participants
                        </Caption>
                      </div>
                    </Info>
                  }
                  type="avatarStack"
                />
              }
            >
              {formatCurrencyWithCode(expense.amount, expense.currency)}
            </Cell>
          ))}
        </Section>
      </div>
    </Modal>
  );
};

export default SnapshotDetailsModal;
