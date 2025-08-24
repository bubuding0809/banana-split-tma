import { TRPCClientError } from "@trpc/client";
import { trpcClient } from "../utils/trpc.js";

const main = async () => {
  const chats = await trpcClient.chat.getAllChats.query({});
  console.log(`Found ${chats.length} chats. Initializing reminders...`);

  const requests = chats.map(async ({ id }) => {
    try {
      const { scheduleArn } =
        await trpcClient.aws.createGroupReminderSchedule.mutate({
          chatId: id.toString(),
          dayOfWeek: "sunday",
          time: "9:00pm",
          timezone: "Asia/Singapore",
          enabled: true,
        });
      console.log(`Created schedule for chat ${id}: ${scheduleArn}`);
      return { chatId: id, scheduleArn };
    } catch (error) {
      if (error instanceof TRPCClientError) {
        if (error.data.code === "CONFLICT") {
          console.log(`Schedule already exists for chat ${id}, skipping.`);
          await trpcClient.aws.updateGroupReminderSchedule.mutate({
            chatId: id.toString(),
            dayOfWeek: "sunday",
            time: "9:00pm",
            timezone: "Asia/Singapore",
            enabled: true,
          });
          return {
            chatId: id,
            message: "Schedule already existed, updated it.",
          };
        }
        console.error(`Failed to create schedule for chat ${id}:`, error.data);
        return { chatId: id, error: error.data };
      }

      if (error instanceof Error) {
        console.error(
          `Failed to create schedule for chat ${id}:`,
          error.message
        );
        return { chatId: id, error: error.message };
      }

      console.error(`Failed to create schedule for chat ${id}:`, error);
      return { chatId: id, error };
    }
  });

  const results = await Promise.allSettled(requests);
  console.log("Results:", results);
};

main();
