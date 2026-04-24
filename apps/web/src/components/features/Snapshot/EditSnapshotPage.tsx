import {
  Section,
  Input,
  Cell,
  Skeleton,
  Caption,
  Info,
  Placeholder,
  Button,
} from "@telegram-apps/telegram-ui";
import { useEffect } from "react";
import { trpc } from "@/utils/trpc";
import {
  hapticFeedback,
  backButton,
  mainButton,
} from "@telegram-apps/sdk-react";
import { z } from "zod";
import { getRouteApi } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import VirtualizedExpenseList from "./VirtualizedExpenseList";
import { RefreshCcw } from "lucide-react";

const routeApi = getRouteApi("/_tma/chat/$chatId_/edit-snapshot/$snapshotId");

interface EditSnapshotPageProps {
  chatId: number;
  snapshotId: string;
  prevTab?: "balance" | "transaction";
}

const snapshotFormSchema = z.object({
  title: z.string().min(1, "Title is required").max(255, "Title too long"),
  expenseIds: z.array(z.string().uuid()).min(1, {
    message: "Select at least one expense to include in the snapshot",
  }),
});

const EditSnapshotPage = ({ chatId, snapshotId }: EditSnapshotPageProps) => {
  const trpcUtils = trpc.useUtils();
  const navigate = routeApi.useNavigate();

  // Fetch existing snapshot data
  const { data: snapshotData, status: snapshotStatus } =
    trpc.snapshot.getDetails.useQuery({
      snapshotId,
    });

  // Get all expenses for this chat
  const { data: expenses, status: expenseStatus } =
    trpc.expense.getExpenseByChat.useQuery({
      chatId,
    });

  // Update snapshot mutation
  const updateSnapshotMutation = trpc.snapshot.update.useMutation({
    onSuccess: () => {
      trpcUtils.snapshot.getByChat.invalidate({ chatId });
      trpcUtils.snapshot.getDetails.invalidate({ snapshotId });
      hapticFeedback.notificationOccurred("success");
      navigate({
        to: "/chat/$chatId/snapshots",
        params: {
          chatId: chatId.toString(),
        },
      });
    },
    onError: (error) => {
      hapticFeedback.notificationOccurred("error");
      console.error("Failed to update snapshot:", error);
    },
  });

  const form = useForm({
    defaultValues: {
      title: snapshotData?.title ?? "",
      expenseIds: snapshotData?.expenses.map((e) => e.id) ?? ([] as string[]),
    },
    validators: {
      onChange: snapshotFormSchema,
    },
    onSubmit: async ({ value }) => {
      mainButton.setParams({
        isLoaderVisible: true,
        isEnabled: false,
      });

      try {
        await updateSnapshotMutation.mutateAsync({
          snapshotId,
          chatId,
          title: value.title,
          expenseIds: value.expenseIds,
        });
      } catch (error) {
        // Error handled in mutation onError
        console.error(error);
        alert("Something went wrong updating snapshot");
      } finally {
        mainButton.setParams({
          isLoaderVisible: false,
          isEnabled: true,
        });
      }
    },
  });

  // Update form default values when snapshot data loads
  useEffect(() => {
    if (snapshotData) {
      form.setFieldValue("title", snapshotData.title);
      form.setFieldValue(
        "expenseIds",
        snapshotData.expenses.map((e) => e.id)
      );
    }
  }, [snapshotData, form]);

  // Setup mainbutton handler
  useEffect(() => {
    if (!mainButton.isMounted()) mainButton.mount();
    const offMainClick = mainButton.onClick(() => form.handleSubmit());

    return () => {
      mainButton.setParams({
        isVisible: false,
        isEnabled: false,
      });
      offMainClick();
    };
  }, [form]);

  // Setup mainbutton params
  useEffect(() => {
    if (!mainButton.isMounted()) mainButton.mount();
    mainButton.setParams({
      text: "Update Snapshot",
      isVisible: true,
      isEnabled: true,
    });

    return () => {
      mainButton.setParams({
        isVisible: false,
        isEnabled: false,
      });
    };
  }, []);

  useEffect(() => {
    backButton.show();
    const offBackClick = backButton.onClick(() => {
      hapticFeedback.impactOccurred("light");
      navigate({
        to: "/chat/$chatId/snapshots",
        params: { chatId: chatId.toString() },
      });
    });

    return () => {
      backButton.hide();
      offBackClick();
    };
  }, [chatId, navigate]);

  // Show loading state while fetching snapshot data
  if (snapshotStatus === "pending") {
    return (
      <div className="flex flex-col gap-2 px-4">
        <Section header="Snapshot Title">
          <Skeleton visible>
            <div className="h-12 w-full rounded bg-gray-200"></div>
          </Skeleton>
        </Section>
        <Section header="Include expenses">
          {Array.from({ length: 5 }).map((_, i) => (
            <Cell
              key={i}
              before={
                <Skeleton visible>
                  <div className="size-6 rounded bg-gray-200" />
                </Skeleton>
              }
              after={
                <Skeleton visible>
                  <Info type="text">Loading...</Info>
                </Skeleton>
              }
            >
              <Skeleton visible>Loading expense...</Skeleton>
            </Cell>
          ))}
        </Section>
      </div>
    );
  }

  if (snapshotStatus === "error") {
    return (
      <div className="flex flex-col gap-2 px-4">
        <Placeholder
          header="Failed to load snapshot"
          description="Please try again or go back"
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
    );
  }

  return (
    <div className="flex flex-col gap-2 px-4">
      {/* Form Section */}
      <form.Field name="title">
        {(field) => (
          <Section header="Snapshot title">
            <Input
              autoFocus
              placeholder="e.g. Staycay in Melbourne"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              status={field.state.meta.errors.length > 0 ? "error" : "default"}
            />
          </Section>
        )}
      </form.Field>

      {/* Expenses Selection */}
      <Section header="Include expenses">
        {expenseStatus === "pending"
          ? Array.from({
              length: 10,
            }).map((_, i) => (
              <Cell
                key={i}
                before={
                  <Skeleton visible>
                    <div className="size-6 rounded bg-gray-200" />
                  </Skeleton>
                }
                subhead={
                  <Skeleton visible>
                    <Caption weight="1" level="1">
                      Someone spent
                    </Caption>
                  </Skeleton>
                }
                description={
                  <Skeleton visible>
                    Some decently descriptive description
                  </Skeleton>
                }
                after={
                  <Skeleton visible>
                    <Info type="text">Something</Info>
                  </Skeleton>
                }
              >
                <Skeleton visible>This is a expense</Skeleton>
              </Cell>
            ))
          : []}

        {expenseStatus === "error" ? (
          <Placeholder
            header="Something went wrong loading expenses"
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
        ) : (
          []
        )}

        {expenseStatus === "success" && expenses && expenses.length > 0 ? (
          <form.Field name="expenseIds">
            {(field) => (
              <VirtualizedExpenseList
                chatId={chatId}
                expenses={expenses}
                selectedExpenseIds={field.state.value}
                onExpenseToggle={field.handleChange}
              />
            )}
          </form.Field>
        ) : (
          []
        )}

        {expenseStatus === "success" && expenses && expenses.length === 0 ? (
          <Placeholder
            header="No expenses found"
            description="This chat has no expenses to include in the snapshot"
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
        ) : (
          []
        )}
      </Section>
    </div>
  );
};

export default EditSnapshotPage;
