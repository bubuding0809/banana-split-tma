import type { Command } from "./types.js";
import { resolveChatId } from "../scope.js";
import { run } from "../output.js";

export const categoryCommands: Command[] = [
  {
    name: "list-categories",
    description: "List all categories available in a chat (base + custom)",
    agentGuidance:
      "Use this to discover the category id (base:<slug> or chat:<uuid>) to pass to create-expense --category or update-expense --category.",
    examples: [
      "banana list-categories",
      "banana list-categories --chat-id 123456789",
    ],
    options: {
      "chat-id": {
        type: "string",
        description: "The numeric chat ID (optional if API key is chat-scoped)",
        required: false,
      },
    },
    execute: (opts, trpc) =>
      run("list-categories", async () => {
        const chatId = await resolveChatId(
          trpc,
          opts["chat-id"] as string | undefined
        );
        return trpc.category.listByChat.query({ chatId });
      }),
  },
];
