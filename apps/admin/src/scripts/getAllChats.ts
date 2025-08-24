import { trpcClient } from "../utils/trpc.js";

const main = async () => {
  try {
    console.log("Fetching all chats...");
    const chats = await trpcClient.chat.getAllChats.query({});
    console.log("Chats:", chats);
    console.log(`Found ${chats.length} chats`);
  } catch (error) {
    console.error("Error fetching chats:", error);
    process.exit(1);
  }
};

main();
