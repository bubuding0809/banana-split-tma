import {
  Section,
  Input,
  Cell,
  Skeleton,
  Caption,
  Info,
  Selectable,
  Placeholder,
  Button,
} from "@telegram-apps/telegram-ui";
import { useEffect } from "react";
import { trpc } from "@/utils/trpc";
import {
  hapticFeedback,
  useSignal,
  backButton,
  mainButton,
  initData,
  themeParams,
} from "@telegram-apps/sdk-react";
import { z } from "zod";
import { getRouteApi, Link } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import VirtualizedExpenseList from "./VirtualizedExpenseList";
import { Plus, RefreshCcw } from "lucide-react";

const routeApi = getRouteApi("/_tma/chat/$chatId_/create-snapshot");

interface CreateSnapshotPageProps {
  chatId: number;
  prevTab: "balance" | "transaction";
}

const snapshotFormSchema = z.object({
  title: z.string().min(1, "Title is required").max(255, "Title too long"),
  expenseIds: z.array(z.string().uuid()).min(1, {
    message: "Select at least one expense to include in the snapshot",
  }),
});

const CreateSnapshotPage = ({ chatId }: CreateSnapshotPageProps) => {
  const trpcUtils = trpc.useUtils();
  const tUserData = useSignal(initData.user);
  const navigate = routeApi.useNavigate();
  const tButtonColor = useSignal(themeParams.buttonColor);
  const tButtonTextColor = useSignal(themeParams.buttonTextColor);

  const userId = tUserData?.id ?? 0;

  // Create snapshot mutation
  const createSnapshotMutation = trpc.snapshot.create.useMutation({
    onSuccess: () => {
      trpcUtils.snapshot.getByChat.invalidate({ chatId });
      hapticFeedback.notificationOccurred("success");
      navigate({
        to: "/chat/$chatId/snapshots",
        search: (prev) => ({
          ...prev,
        }),
        params: {
          chatId: chatId.toString(),
        },
      });
    },
    onError: (error) => {
      hapticFeedback.notificationOccurred("error");
      console.error("Failed to create snapshot:", error);
    },
  });

  const form = useForm({
    defaultValues: {
      title: "",
      expenseIds: [] as string[],
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
        await createSnapshotMutation.mutateAsync({
          creatorId: userId,
          chatId,
          title: value.title,
          expenseIds: value.expenseIds,
        });
      } catch (error) {
        // Error handled in mutation onError
        console.error(error);
        alert("Something went wrong creating snapshot");
      } finally {
        mainButton.setParams({
          isLoaderVisible: false,
          isEnabled: true,
        });
      }
    },
  });

  // Get selected expenses data
  const { data: expenses, status: expenseStatus } =
    trpc.expense.getExpenseByChat.useQuery({
      chatId,
    });

  // Setup mainbutton handler
  useEffect(() => {
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
    mainButton.setParams({
      text: "Create Snapshot",
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
        to: "../snapshots",
        params: { chatId: chatId.toString() },
        search: (prev) => ({
          ...prev,
        }),
      });
    });

    return () => {
      backButton.hide();
      offBackClick();
    };
  }, [chatId, navigate]);

  return (
    <div className="flex flex-col gap-2 px-4">
      {/* Form Section */}
      <form.Field name="title">
        {(field) => (
          <Section header="Give your snapshot a title">
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
            }).map((_, i) => <ExpenseCellLoader key={i} />)
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

        {expenseStatus === "success" && expenses.length > 0 ? (
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

        {expenseStatus === "success" && expenses.length === 0 ? (
          <Placeholder
            header="No expenses found"
            description="Go and create some first"
            action={
              <Link
                to="/chat/$chatId/add-expense"
                params={{
                  chatId: chatId.toString(),
                }}
                search={(prev) => ({
                  ...prev,
                  title: "+ Add expense",
                })}
                className="w-full"
              >
                <Button
                  before={<Plus />}
                  stretched
                  mode="filled"
                  style={{
                    backgroundColor: tButtonColor,
                    color: tButtonTextColor,
                  }}
                >
                  Add Expense
                </Button>
              </Link>
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
      </Section>
    </div>
  );
};

const ExpenseCellLoader = () => (
  <Cell
    before={
      <Skeleton visible>
        <Selectable />
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
      <Skeleton visible>Some decently descriptive description</Skeleton>
    }
    after={
      <Skeleton visible>
        <Info type="text">Something</Info>
      </Skeleton>
    }
  >
    <Skeleton visible>This is a expense</Skeleton>
  </Cell>
);

export default CreateSnapshotPage;
