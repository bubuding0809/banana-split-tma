import React, { useCallback, useState } from "react";
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
import EditReminderScheduleModal from "./EditReminderScheduleModal";

interface RecurringRemindersSectionProps {
  chatId: number;
}

const RecurringRemindersSection: React.FC<RecurringRemindersSectionProps> = ({
  chatId,
}) => {
  // State
  const [editModalOpen, setEditModalOpen] = useState(false);

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
            onClick={() => {
              hapticFeedback.impactOccurred("light");
              setEditModalOpen(true);
            }}
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

      {/* Edit Schedule Modal */}
      <EditReminderScheduleModal
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        chatId={chatId}
        initialValues={
          scheduleData
            ? {
                timezone: scheduleData.timezone,
                dayOfWeek: scheduleData.dayOfWeek || "sunday",
                time: scheduleData.time || "9pm",
              }
            : undefined
        }
      />
    </>
  );
};

export default RecurringRemindersSection;
