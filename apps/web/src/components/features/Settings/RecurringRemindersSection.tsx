import React, { useCallback } from "react";
import { trpc } from "@/utils/trpc";
import { hapticFeedback } from "@telegram-apps/sdk-react";
import { Cell, Navigation, Switch, Section } from "@telegram-apps/telegram-ui";
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
    trpc.aws.getChatSchedule.useQuery({ chatId: chatId.toString() });

  const updateMutation = trpc.aws.updateGroupReminderSchedule.useMutation({
    onSuccess: () => {
      trpcUtils.aws.getChatSchedule.invalidate({ chatId: chatId.toString() });
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
        chatId: chatId.toString(),
        enabled,
      });
    },
    [chatId, updateMutation]
  );

  const isLoading =
    scheduleStatus === "pending" || updateMutation.status === "pending";

  return (
    <>
      <Section
        header="Recurring Reminders"
        footer="Automatically send reminders to the group to settle outstanding debts."
      >
        {/* Status and Toggle */}
        <Cell
          Component="label"
          before={
            scheduleData?.enabled ? (
              <BellRing size={20} />
            ) : (
              <BellOff size={20} />
            )
          }
          after={
            <Switch
              checked={scheduleData?.enabled}
              onChange={(e) => handleToggleEnabled(e.target.checked)}
              disabled={isLoading}
            />
          }
        >
          {scheduleData?.enabled ? "Reminders Enabled" : "Reminders Disabled"}
        </Cell>

        {/* Schedule Configuration */}
        {scheduleData?.enabled && (
          <Cell
            onClick={() => alert("Coming soon!")}
            after={<Navigation>Edit</Navigation>}
            disabled={isLoading}
            subtitle={scheduleData?.timezone}
          >
            {`Every ${scheduleData?.dayOfWeek}, ${scheduleData?.time}`}
          </Cell>
        )}
      </Section>
    </>
  );
};

export default RecurringRemindersSection;
