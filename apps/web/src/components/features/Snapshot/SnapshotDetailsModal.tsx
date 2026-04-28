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
  Spinner,
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
import { X, RefreshCcw, Pencil, Send, BarChart3 } from "lucide-react";
import { formatCurrencyWithCode } from "@/utils/financial";
import { useCallback, useRef, useEffect, useMemo, memo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { format } from "date-fns";
import { cn } from "@/utils/cn";
import { useNavigate } from "@tanstack/react-router";
import { compareDatesDesc, formatSnapshotDateRange } from "@/utils/date";
import { compareTransactions } from "@/utils/transactionHelpers";
import { useSnapshotAggregations } from "./hooks/useSnapshotAggregations";

interface SnapshotDetailsModalProps {
  snapshotId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onShareSuccess?: () => void;
}

const SnapshotDetailsModal = ({
  snapshotId,
  open,
  onOpenChange,
  onShareSuccess,
}: SnapshotDetailsModalProps) => {
  const trpcUtils = trpc.useUtils();
  const navigate = useNavigate();
  const tSubtitleTextColor = useSignal(themeParams.subtitleTextColor);
  const tButtonColor = useSignal(themeParams.buttonColor);
  const tDesctructiveTextColor = useSignal(themeParams.destructiveTextColor);
  const tUserData = useSignal(initData.user);
  const offSecondaryButtonClickRef = useRef<VoidFunction | undefined>(
    undefined
  );
  const expenseListParentRef = useRef<HTMLDivElement>(null);

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
  const {
    status: aggStatus,
    error: aggError,
    aggregations,
  } = useSnapshotAggregations(snapshotId, { enabled: open });

  const snapShotDetails = aggregations?.details ?? null;
  const baseCurrency = aggregations?.baseCurrency ?? "SGD";
  const userShareTotal = aggregations?.userShareInBase ?? null;

  useEffect(() => {
    if (
      (aggError as { data?: { code?: string } } | undefined)?.data?.code ===
      "NOT_FOUND"
    ) {
      if (popup.isSupported()) {
        popup.open({
          title: "Snapshot Not Found",
          message: "This snapshot has been deleted or does not exist.",
          buttons: [{ type: "ok", id: "ok" }],
        });
      }
      onOpenChange(false);
    }
  }, [aggError, onOpenChange]);

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

  const shareSnapshotMutation = trpc.snapshot.shareSnapshotMessage.useMutation({
    onSuccess: () => {
      if (hapticFeedback.isSupported())
        hapticFeedback.notificationOccurred("success");
      onOpenChange(false);

      if (onShareSuccess) {
        onShareSuccess();
      }
    },
    onError: (err) => {
      if (hapticFeedback.isSupported())
        hapticFeedback.notificationOccurred("error");
      if (popup.isSupported()) {
        popup.open({
          title: "Error",
          message:
            err.data?.code === "TOO_MANY_REQUESTS"
              ? "Please wait a minute before sharing this snapshot again."
              : "Failed to share snapshot. Please try again.",
          buttons: [{ type: "ok", id: "ok" }],
        });
      }
    },
  });

  // * Handlers ====================================================================================
  const handleShareClick = () => {
    if (popup.isSupported()) {
      popup
        .open({
          title: "Share Snapshot",
          message: "Share this snapshot to the group chat?",
          buttons: [
            { type: "cancel", id: "cancel" },
            { id: "share", type: "default", text: "Share" },
          ],
        })
        .then((buttonId) => {
          if (buttonId === "share") {
            if (hapticFeedback.isSupported())
              hapticFeedback.impactOccurred("light");
            shareSnapshotMutation.mutate({ snapshotId });
          }
        });
    } else {
      // Fallback if not running in Telegram client
      shareSnapshotMutation.mutate({ snapshotId });
    }
  };

  const handleEdit = useCallback(() => {
    if (!snapShotDetails) return;

    hapticFeedback.impactOccurred("light");
    onOpenChange(false);
    navigate({
      to: "/chat/$chatId/edit-snapshot/$snapshotId",
      params: {
        chatId: snapShotDetails.chatId.toString(),
        snapshotId,
      },
      search: {
        prevTab: "transaction",
        title: "Edit Snapshot",
      },
    });
  }, [snapShotDetails, snapshotId, navigate, onOpenChange]);

  const handleDelete = useCallback(async () => {
    hapticFeedback.impactOccurred("medium");
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

  const displayExpenses = useMemo(() => {
    if (!snapShotDetails?.expenses) return [];

    return snapShotDetails.expenses
      .sort((a, b) => compareTransactions(a, b, "date", compareDatesDesc))
      .filter((expense) =>
        expense.shares.find((s: { userId: number }) => s.userId === userId)
      );
  }, [snapShotDetails?.expenses, userId]);

  const categoryEmojiByExpenseId =
    aggregations?.categoryEmojiByExpenseId ?? new Map<string, string>();

  // Setup virtualizer for expense list
  const virtualizer = useVirtualizer({
    count: displayExpenses.length,
    getScrollElement: () => expenseListParentRef.current,
    estimateSize: (index) => {
      const expense = displayExpenses[index];
      if (!expense) return 90;
      // Base height for expense cells in modal
      // Account for longer descriptions
      let baseHeight = 90;
      if (expense.description && expense.description.length > 50) {
        baseHeight += 20;
      }
      return baseHeight;
    },
    overscan: 3,
    getItemKey: (index) => displayExpenses[index]?.id ?? index,
  });

  if (aggStatus === "pending") {
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

  if (aggStatus === "error") {
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

  if (!snapShotDetails) return null;

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
            <div className="flex items-center gap-2">
              <IconButton
                size="s"
                mode="gray"
                onClick={() => {
                  if (!snapShotDetails) return;
                  if (hapticFeedback.isSupported())
                    hapticFeedback.impactOccurred("light");
                  onOpenChange(false);
                  navigate({
                    to: "/chat/$chatId/snapshots/$snapshotId",
                    params: {
                      chatId: String(snapShotDetails.chatId),
                      snapshotId,
                    },
                    search: { view: "cat" },
                  });
                }}
                className="p-1"
                disabled={!snapShotDetails}
              >
                <BarChart3
                  size={20}
                  strokeWidth={3}
                  style={{ color: tButtonColor }}
                />
              </IconButton>
              <IconButton
                size="s"
                mode="gray"
                onClick={handleShareClick}
                className="p-1"
                disabled={shareSnapshotMutation.isPending}
              >
                {shareSnapshotMutation.isPending ? (
                  <Spinner size="s" />
                ) : (
                  <Send
                    size={20}
                    strokeWidth={3}
                    style={{ color: tButtonColor }}
                  />
                )}
              </IconButton>
              <IconButton
                size="s"
                mode="gray"
                onClick={handleEdit}
                className="p-1"
              >
                <Pencil
                  size={20}
                  strokeWidth={3}
                  style={{ color: tButtonColor }}
                />
              </IconButton>
              <Modal.Close>
                <IconButton size="s" mode="gray">
                  <X
                    size={20}
                    strokeWidth={3}
                    style={{ color: tSubtitleTextColor }}
                  />
                </IconButton>
              </Modal.Close>
            </div>
          }
        />
      }
    >
      <div className="max-h-[80vh]">
        {/* Header — mirrors the snapshot list-row + detail-page hero:
            title + date range on the left, red user-share + expense
            count on the right. */}
        <Section>
          <Cell
            after={
              <Info
                type="text"
                subtitle={`${snapShotDetails.expenses.length} ${
                  snapShotDetails.expenses.length === 1 ? "Expense" : "Expenses"
                }`}
              >
                {userShareTotal === null ? (
                  <Skeleton visible>
                    <Text weight="3" className="text-red-600">
                      Loading...
                    </Text>
                  </Skeleton>
                ) : (
                  <Text weight="3" className="text-red-600">
                    {formatCurrencyWithCode(userShareTotal, baseCurrency)}
                  </Text>
                )}
              </Info>
            }
            description={
              aggregations?.dateRange
                ? formatSnapshotDateRange(
                    aggregations.dateRange.earliest,
                    aggregations.dateRange.latest
                  )
                : undefined
            }
          >
            <Text weight="2" className="text-lg">
              {snapShotDetails.title}
            </Text>
          </Cell>
        </Section>

        {/* Expenses List */}
        <Section header="Included Expenses" className="mt-4">
          <div
            ref={expenseListParentRef}
            className="h-[40vh] overflow-auto"
            style={{
              contain: "strict",
              scrollbarWidth: "thin",
            }}
          >
            <div
              style={{
                height: virtualizer.getTotalSize(),
                width: "100%",
                position: "relative",
              }}
            >
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const expense = displayExpenses[virtualItem.index];
                if (!expense) return null;

                return (
                  <div
                    key={virtualItem.key}
                    data-index={virtualItem.index}
                    ref={virtualizer.measureElement}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                  >
                    <SnapshotExpenseCell
                      expense={expense}
                      userId={userId}
                      categoryEmoji={categoryEmojiByExpenseId.get(expense.id)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </Section>
      </div>
    </Modal>
  );
};

// Type definition for expense from snapshot details
type SnapshotExpense = {
  id: string;
  chatId: number;
  creatorId: number;
  payerId: number;
  description: string;
  amount: number;
  currency: string;
  categoryId: string | null;
  date: Date;
  createdAt: Date;
  payer: {
    id: number;
    firstName: string;
  };
  shares: {
    userId: number;
    amount: number | null;
  }[];
};

// Memoized expense cell component for virtualization
const SnapshotExpenseCell = memo(
  ({
    expense,
    userId,
    categoryEmoji,
  }: {
    expense: SnapshotExpense;
    userId: number;
    categoryEmoji?: string;
  }) => {
    return (
      <Cell
        className={cn(
          !expense.shares.find(
            (s: { userId: number }) => s.userId === userId
          ) && "bg-neutral-100 dark:bg-neutral-700"
        )}
        before={
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[rgba(255,255,255,0.06)] text-xl leading-none">
            {categoryEmoji ?? "❓"}
          </div>
        }
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
                    {format(new Date(expense.date), "d MMM yyyy")}
                  </Caption>
                  <Text
                    weight="3"
                    className={cn(
                      expense.shares.find(
                        (s: { userId: number }) => s.userId === userId
                      )
                        ? "text-red-600"
                        : "text-gray-600"
                    )}
                  >
                    {formatCurrencyWithCode(
                      expense.shares.find(
                        (s: { userId: number }) => s.userId === userId
                      )?.amount,
                      expense.currency
                    )}
                  </Text>
                  <Caption className="w-max">
                    {expense.shares.find(
                      (s: { userId: number }) => s.userId === userId
                    )
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
    );
  }
);

SnapshotExpenseCell.displayName = "SnapshotExpenseCell";

export default SnapshotDetailsModal;
