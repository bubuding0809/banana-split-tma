import React, { useEffect } from "react";
import {
  hapticFeedback,
  themeParams,
  useSignal,
} from "@telegram-apps/sdk-react";
import {
  Button,
  Cell,
  Divider,
  IconButton,
  Modal,
  Navigation,
  Section,
  Text,
  Title,
} from "@telegram-apps/telegram-ui";
import { X, Clock, Globe, Calendar } from "lucide-react";
import { trpc } from "@/utils/trpc";
import { useAppForm } from "@/hooks";
import { useStore } from "@tanstack/react-form";
import {
  editReminderScheduleFormOpts,
  convert12HourTo24Hour,
  convert24HourTo12Hour,
} from "./EditReminderScheduleModal.type";
import {
  COMMON_TIMEZONES,
  DAYS_OF_WEEK,
  formatDayOfWeek,
  formatTimezone,
  type Timezone,
  type DayOfWeek,
} from "@/constants/timezones";
import FieldInfo from "@/components/ui/FieldInfo";

interface EditReminderScheduleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chatId: number;
  initialValues?: {
    timezone: string;
    dayOfWeek: string;
    time: string;
  };
}

const EditReminderScheduleModal: React.FC<EditReminderScheduleModalProps> = ({
  open,
  onOpenChange,
  chatId,
  initialValues,
}) => {
  const tSubtitleTextColor = useSignal(themeParams.subtitleTextColor);
  const tButtonColor = useSignal(themeParams.buttonColor);

  // TRPC Utils
  const trpcUtils = trpc.useUtils();

  // Form setup
  const form = useAppForm({
    ...editReminderScheduleFormOpts,
    defaultValues: {
      timezone: (initialValues?.timezone as Timezone) || "Asia/Singapore",
      dayOfWeek: (initialValues?.dayOfWeek as DayOfWeek) || "sunday",
      time: initialValues?.time
        ? convert12HourTo24Hour(initialValues.time)
        : "21:00",
    },
    onSubmit: async ({ value }) => {
      try {
        await updateMutation.mutateAsync({
          chatId,
          timezone: value.timezone,
          dayOfWeek: value.dayOfWeek,
          time: convert24HourTo12Hour(value.time),
        });
      } catch (error) {
        console.error("Failed to update reminder:", error);
      }
    },
  });

  // Mutation
  const updateMutation = trpc.aws.updateGroupReminderSchedule.useMutation({
    onMutate: async (newSchedule) => {
      // Optimistic update
      await trpcUtils.aws.getChatSchedule.cancel({ chatId });
      const previousSchedule = trpcUtils.aws.getChatSchedule.getData({
        chatId,
      });

      trpcUtils.aws.getChatSchedule.setData({ chatId }, (old) => {
        if (!old) return old;
        return {
          ...old,
          timezone: newSchedule.timezone || old.timezone,
          dayOfWeek: newSchedule.dayOfWeek || old.dayOfWeek,
          time: newSchedule.time || old.time,
        };
      });

      return { previousSchedule };
    },
    onSuccess: () => {
      trpcUtils.aws.getChatSchedule.invalidate({ chatId });
      hapticFeedback.notificationOccurred("success");
      onOpenChange(false);
    },
    onError: (error, _variables, context) => {
      // Revert optimistic update
      if (context?.previousSchedule) {
        trpcUtils.aws.getChatSchedule.setData(
          { chatId },
          context.previousSchedule
        );
      }
      console.error("Failed to update reminder:", error);
      hapticFeedback.notificationOccurred("error");
      alert("Failed to update reminder. Please try again.");
    },
  });

  // Get current form values for display
  const currentTimezone = useStore(
    form.store,
    (state) => state.values.timezone
  );
  const currentDayOfWeek = useStore(
    form.store,
    (state) => state.values.dayOfWeek
  );
  const currentTime = useStore(form.store, (state) => state.values.time);

  // Track if form is dirty (has changes)
  const isDirty = useStore(form.store, (state) => {
    if (!initialValues) return false;

    const timezoneDirty = state.values.timezone !== initialValues.timezone;
    const dayDirty = state.values.dayOfWeek !== initialValues.dayOfWeek;
    const timeDirty =
      state.values.time !== convert12HourTo24Hour(initialValues.time);

    return timezoneDirty || dayDirty || timeDirty;
  });

  // Reset form when modal opens
  useEffect(() => {
    if (open && initialValues) {
      form.setFieldValue("timezone", initialValues.timezone as Timezone);
      form.setFieldValue("dayOfWeek", initialValues.dayOfWeek as DayOfWeek);
      form.setFieldValue("time", convert12HourTo24Hour(initialValues.time));
    }
  }, [open, initialValues, form]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    form.handleSubmit();
  };

  const isLoading = updateMutation.status === "pending";

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      header={
        <Modal.Header
          before={
            <Title weight="2" level="3">
              Edit Reminder Schedule
            </Title>
          }
          after={
            <Modal.Close>
              <IconButton
                size="s"
                mode="gray"
                onClick={() => hapticFeedback.impactOccurred("light")}
              >
                <X
                  size={20}
                  strokeWidth={3}
                  style={{
                    color: tSubtitleTextColor,
                  }}
                />
              </IconButton>
            </Modal.Close>
          }
        />
      }
    >
      <form onSubmit={handleSubmit} className="max-h-[75vh] pb-5">
        <div className="flex flex-col gap-3">
          <Section className="px-3">
            <form.AppField name="timezone">
              {(field) => (
                <div className="flex flex-col">
                  <Cell
                    Component="label"
                    htmlFor="timezone-select"
                    before={<Globe size={20} />}
                    after={
                      <div className="relative">
                        <select
                          id="timezone-select"
                          value={field.state.value}
                          onChange={(e) => {
                            field.handleChange(e.target.value as Timezone);
                            hapticFeedback.impactOccurred("light");
                          }}
                          onBlur={field.handleBlur}
                          className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                          disabled={isLoading}
                        >
                          {COMMON_TIMEZONES.map((tz) => (
                            <option key={tz} value={tz}>
                              {formatTimezone(tz)}
                            </option>
                          ))}
                        </select>
                        <Navigation>
                          <Text className="max-w-[200px] truncate">
                            {formatTimezone(currentTimezone)}
                          </Text>
                        </Navigation>
                      </div>
                    }
                  >
                    TZ
                  </Cell>
                  <div className="px-2">
                    <FieldInfo />
                  </div>
                </div>
              )}
            </form.AppField>
            <form.AppField name="dayOfWeek">
              {(field) => (
                <div className="flex flex-col">
                  <Cell
                    Component="label"
                    htmlFor="dayOfWeek-select"
                    before={<Calendar size={20} />}
                    after={
                      <div className="relative">
                        <select
                          id="dayOfWeek-select"
                          value={field.state.value}
                          onChange={(e) => {
                            field.handleChange(e.target.value as DayOfWeek);
                            hapticFeedback.impactOccurred("light");
                          }}
                          onBlur={field.handleBlur}
                          className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                          disabled={isLoading}
                        >
                          {DAYS_OF_WEEK.map((day) => (
                            <option key={day} value={day}>
                              {formatDayOfWeek(day)}
                            </option>
                          ))}
                        </select>
                        <Navigation>
                          <Text>{formatDayOfWeek(currentDayOfWeek)}</Text>
                        </Navigation>
                      </div>
                    }
                  >
                    Day of Week
                  </Cell>
                  <div className="px-2">
                    <FieldInfo />
                  </div>
                </div>
              )}
            </form.AppField>
            <form.AppField name="time">
              {(field) => (
                <div className="flex flex-col">
                  <Cell
                    Component="label"
                    htmlFor="time-input"
                    before={<Clock size={20} />}
                    after={
                      <div className="relative">
                        <input
                          type="time"
                          id="time-input"
                          value={field.state.value}
                          onChange={(e) => {
                            field.handleChange(e.target.value);
                            hapticFeedback.impactOccurred("light");
                          }}
                          onBlur={field.handleBlur}
                          className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                          disabled={isLoading}
                        />
                        <Navigation>
                          <Text>{convert24HourTo12Hour(currentTime)}</Text>
                        </Navigation>
                      </div>
                    }
                  >
                    Time
                  </Cell>
                  <div className="px-2">
                    <FieldInfo />
                  </div>
                </div>
              )}
            </form.AppField>
          </Section>

          {/* Save Button */}
          <>
            <Divider />
            <Button
              mode="plain"
              size="l"
              onClick={(e) => {
                if (!isDirty || isLoading) return;
                hapticFeedback.impactOccurred("medium");
                handleSubmit(e);
              }}
              className="relative mx-2"
              disabled={!isDirty || isLoading}
              style={{
                color:
                  isDirty && !isLoading ? tButtonColor : tSubtitleTextColor,
              }}
            >
              {isLoading ? "Saving..." : "Save Changes"}
            </Button>
          </>
        </div>
      </form>
    </Modal>
  );
};

export default EditReminderScheduleModal;
