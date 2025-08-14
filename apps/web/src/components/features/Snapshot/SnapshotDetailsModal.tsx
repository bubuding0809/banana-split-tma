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
  Placeholder,
  Button,
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
import { X, TrendingDown, RefreshCcw } from "lucide-react";
import { formatCurrencyWithCode } from "@/utils/financial";
import ChatMemberAvatar from "@/components/ui/ChatMemberAvatar";
import { useCallback, useRef, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { cn } from "@/utils/cn";

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
  const trpcUtils = trpc.useUtils();
  const tSubtitleTextColor = useSignal(themeParams.subtitleTextColor);
  const tButtonColor = useSignal(themeParams.buttonColor);
  const tDesctructiveTextColor = useSignal(themeParams.destructiveTextColor);
  const tUserData = useSignal(initData.user);
  const offSecondaryButtonClickRef = useRef<VoidFunction | undefined>(
    undefined
  );

  const userId = tUserData?.id ?? 0;

  // * Effects =====================================================================================
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

  // * Queries =====================================================================================
  const { data: snapShotDetails, status: snapShotDetailsStatus } =
    trpc.snapshot.getDetails.useQuery(
      {
        snapshotId,
      },
      {
        enabled: open,
      }
    );

  // * Mutations ===================================================================================
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

  // * Handlers ====================================================================================
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

  // Calculate total damage for the main user (net sum of user's share amounts)
  const userShareTotal = useMemo(() => {
    if (!snapShotDetails) return 0;

    return snapShotDetails.expenses.reduce(
      (accExpense, currExpense) =>
        accExpense +
        currExpense.shares.reduce((accShare, currShare) => {
          if (currShare.userId !== userId) {
            return accShare;
          } else {
            return accShare + (currShare.amount ?? 0);
          }
        }, 0),
      0
    );
  }, [snapShotDetails, userId]);

  if (snapShotDetailsStatus === "pending") {
    return (
      <Modal open={open} onOpenChange={handleOpenChange}>
        <div className="h-[70vh]">
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

  if (snapShotDetailsStatus === "error") {
    return (
      <Modal open={open} onOpenChange={handleOpenChange}>
        <div className="h-[70vh]">
          <Placeholder
            header="Something went wrong loading snapshot"
            description="You can try again later or reload the page now"
            action={
              <Button
                stretched
                before={<RefreshCcw />}
                onClick={() => window.location.reload()}
              >
                Reload
              </Button>
            }
          >
            <img
              alt="Telegram sticker"
              src="https://xelene.me/telegram.gif"
              style={{
                display: "block",
                height: "144px",
                width: "144px",
              }}
            />
          </Placeholder>
        </div>
      </Modal>
    );
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
              <ChatMemberAvatar userId={snapShotDetails.creator.id} size={48} />
            }
            after={
              <Info type="text" subtitle="Created">
                {format(new Date(snapShotDetails.createdAt), "dd/mm/yy")}
              </Info>
            }
            subtitle={`${snapShotDetails.expenses.length} expenses`}
          >
            <Text weight="2" className="text-lg">
              {snapShotDetails.title}
            </Text>
          </Cell>
        </Section>

        {/* Total Damage for Main User */}
        {userId && userShareTotal > 0 && (
          <Section header="How much did you spend?" className="mt-4">
            <Cell
              before={
                <span className="rounded-lg bg-red-500 p-1.5">
                  <TrendingDown size={20} color="white" />
                </span>
              }
              after={
                <Info type="text" subtitle="Total">
                  <Text weight="3" className="text-lg text-red-600">
                    {formatCurrencyWithCode(
                      userShareTotal,
                      snapShotDetails.currency
                    )}
                  </Text>
                </Info>
              }
              description="Net sum of your expense shares"
            >
              <Text weight="3">You spent</Text>
            </Cell>
          </Section>
        )}

        {/* Expenses List */}
        <Section header="Included Expenses" className="mt-4">
          {snapShotDetails.expenses.map((expense) => (
            <Cell
              className={cn(
                !expense.shares.find((s) => s.userId === userId) &&
                  "bg-neutral-100 dark:bg-neutral-700"
              )}
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
                          {format(new Date(expense.createdAt), "d MMM yyyy")}
                        </Caption>
                        <Text
                          weight="3"
                          className={cn(
                            expense.shares.find((s) => s.userId === userId)
                              ? "text-red-600"
                              : "textgray-600"
                          )}
                        >
                          {formatCurrencyWithCode(
                            expense.shares.find((s) => s.userId === userId)
                              ?.amount,
                            expense.currency
                          )}
                        </Text>
                        <Caption className="w-max">
                          {expense.shares.find((s) => s.userId === userId)
                            ? "Share"
                            : "Unrelated"}
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
