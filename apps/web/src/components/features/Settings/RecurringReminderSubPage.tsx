import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { backButton, hapticFeedback } from "@telegram-apps/sdk-react";
import {
  Cell,
  Navigation,
  Section,
  Skeleton,
  Switch,
} from "@telegram-apps/telegram-ui";
import { Calendar, Clock } from "lucide-react";
import { trpc } from "@/utils/trpc";
import EditReminderScheduleModal from "./EditReminderScheduleModal";
import IconSquare from "./IconSquare";

interface RecurringReminderSubPageProps {
  chatId: number;
}

export default function RecurringReminderSubPage({
  chatId,
}: RecurringReminderSubPageProps) {
  const navigate = useNavigate();
  const trpcUtils = trpc.useUtils();
  const [editOpen, setEditOpen] = useState(false);

  const { data: schedule, status } = trpc.aws.getChatSchedule.useQuery({
    chatId,
  });
  const update = trpc.aws.updateGroupReminderSchedule.useMutation({
    onSuccess: () => trpcUtils.aws.getChatSchedule.invalidate({ chatId }),
    onError: () => hapticFeedback.notificationOccurred("error"),
  });

  useEffect(() => {
    backButton.show();
    return () => backButton.hide();
  }, []);

  useEffect(() => {
    const off = backButton.onClick(() => {
      hapticFeedback.notificationOccurred("success");
      navigate({
        to: "/chat/$chatId/settings",
        params: { chatId: String(chatId) },
      });
    });
    return () => off();
  }, [chatId, navigate]);

  const onToggle = useCallback(
    (enabled: boolean) => {
      hapticFeedback.notificationOccurred("success");
      update.mutate({ chatId, enabled });
    },
    [chatId, update]
  );

  const isLoading = status === "pending" || update.status === "pending";

  return (
    <main className="px-3 pb-8">
      <Section header="Status">
        <Cell
          Component="label"
          before={
            <IconSquare color="purple">
              <Clock size={14} />
            </IconSquare>
          }
          after={
            <Skeleton visible={status === "pending"}>
              <Switch
                checked={schedule?.enabled ?? false}
                onChange={(e) => onToggle(e.target.checked)}
                disabled={isLoading}
              />
            </Skeleton>
          }
        >
          Enabled
        </Cell>
      </Section>

      {schedule?.enabled && (
        <Section
          header="Schedule"
          footer="Sends a balance summary so the group settles up."
        >
          <Cell
            before={
              <IconSquare color="teal">
                <Calendar size={14} />
              </IconSquare>
            }
            subtitle={schedule.timezone}
            after={<Navigation>Edit</Navigation>}
            onClick={() => {
              hapticFeedback.impactOccurred("light");
              setEditOpen(true);
            }}
            disabled={isLoading}
          >
            Every <span className="capitalize">{schedule.dayOfWeek}</span>, at{" "}
            {schedule.time}
          </Cell>
        </Section>
      )}

      <EditReminderScheduleModal
        open={editOpen}
        onOpenChange={setEditOpen}
        chatId={chatId}
        initialValues={
          schedule
            ? {
                timezone: schedule.timezone,
                dayOfWeek: schedule.dayOfWeek || "sunday",
                time: schedule.time || "9pm",
              }
            : undefined
        }
      />
    </main>
  );
}
