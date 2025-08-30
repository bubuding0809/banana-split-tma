import React, { useCallback } from "react";
import { trpc } from "@/utils/trpc";
import { hapticFeedback } from "@telegram-apps/sdk-react";
import {
  Cell,
  Navigation,
  Switch,
  Section,
  Skeleton,
} from "@telegram-apps/telegram-ui";
import { BellRing, BellOff } from "lucide-react";

interface RecurringRemindersSectionProps {
  chatId: number;
}

const RecurringRemindersSection: React.FC<RecurringRemindersSectionProps> = ({
  chatId,
}) => {
  // TRPC Utils
  const trpcUtils = trpc.useUtils();

  // Queries
  const { data: scheduleData, status: scheduleStatus } =
    trpc.aws.getChatSchedule.useQuery({ chatId });

  const updateMutation = trpc.aws.updateGroupReminderSchedule.useMutation({
    onSuccess: () => {
      trpcUtils.aws.getChatSchedule.invalidate({ chatId });
    },
    onError: (error) => {
      console.error("Failed to update reminder:", error);
      hapticFeedback.notificationOccurred("error");
    },
  });

  //* Handlers =====================================================================================
  const handleToggleEnabled = useCallback(
    (enabled: boolean) => {
      hapticFeedback.notificationOccurred("success");

      // Update only the enabled field
      updateMutation.mutate({
        chatId,
        enabled,
      });
    },
    [chatId, updateMutation]
  );

  const isLoading =
    scheduleStatus === "pending" || updateMutation.status === "pending";

  return (
    <>
      <Section header="Notifications">
        {/* Status and Toggle */}
        <Cell
          disabled={scheduleStatus === "pending"}
          Component="label"
          before={
            scheduleData?.enabled ? (
              <BellRing size={20} />
            ) : (
              <BellOff size={20} />
            )
          }
          after={
            <Skeleton visible={scheduleStatus === "pending"}>
              <Switch
                checked={scheduleData?.enabled}
                onChange={(e) => handleToggleEnabled(e.target.checked)}
                disabled={isLoading}
              />
            </Skeleton>
          }
        >
          Recurring Reminders
        </Cell>

        {/* Schedule Configuration */}
        {scheduleData?.enabled ? (
          <Cell
            onClick={() => alert("Coming soon!")}
            after={<Navigation>Edit</Navigation>}
            disabled={isLoading}
            subtitle={scheduleData?.timezone}
          >
            Every <span className="capitalize">{scheduleData?.dayOfWeek}</span>,
            at <span>{scheduleData?.time}</span>
          </Cell>
        ) : (
          []
        )}
      </Section>
    </>
  );
};

export default RecurringRemindersSection;
