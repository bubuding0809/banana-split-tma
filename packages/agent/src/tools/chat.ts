import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { createTrpcCaller } from "../trpc.js";

export const getChatDetailsTool = createTool({
  id: "getChatDetailsTool",
  description:
    "Get details for the current chat, including members and their balances.",
  inputSchema: z.object({}),
  execute: async (data, context) => {
    const { caller, chatId } = createTrpcCaller(context);
    // Note: Use getChat as getChatDetails was requested but the router exposes getChat
    const result = await caller.chat.getChat({ chatId });
    return JSON.stringify(result);
  },
});
