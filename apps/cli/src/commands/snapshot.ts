import type { Command } from "./types.js";
import { resolveChatId } from "../scope.js";
import { run, error } from "../output.js";

export const snapshotCommands: Command[] = [
  {
    name: "list-snapshots",
    description: "List all expense snapshots in a chat",
    options: {
      "chat-id": {
        type: "string",
        description: "The numeric chat ID (optional if API key is chat-scoped)",
      },
    },
    execute: (opts, trpc) =>
      run("list-snapshots", async () => {
        const chatId = await resolveChatId(
          trpc,
          opts["chat-id"] as string | undefined
        );
        return trpc.snapshot.getByChat.query({ chatId });
      }),
  },

  {
    name: "get-snapshot",
    description: "Get full details of a specific snapshot",
    options: {
      "snapshot-id": {
        type: "string",
        description: "The snapshot UUID",
      },
    },
    execute: (opts, trpc) => {
      if (!opts["snapshot-id"]) {
        return error(
          "missing_option",
          "--snapshot-id is required",
          "get-snapshot"
        );
      }
      return run("get-snapshot", async () => {
        return trpc.snapshot.getDetails.query({
          snapshotId: String(opts["snapshot-id"]),
        });
      });
    },
  },
];
