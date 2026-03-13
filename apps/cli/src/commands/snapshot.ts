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
  {
    name: "create-snapshot",
    description:
      "Create an expense snapshot combining multiple specific expenses",
    options: {
      "chat-id": { type: "string", description: "The numeric chat ID" },
      "creator-id": {
        type: "string",
        description: "The user ID creating the snapshot",
      },
      title: { type: "string", description: "Snapshot title" },
      "expense-ids": {
        type: "string",
        description: "Comma-separated expense UUIDs",
      },
    },
    execute: (opts, trpc) => {
      if (!opts["creator-id"])
        return error(
          "missing_option",
          "--creator-id is required",
          "create-snapshot"
        );
      if (!opts.title)
        return error(
          "missing_option",
          "--title is required",
          "create-snapshot"
        );
      if (!opts["expense-ids"])
        return error(
          "missing_option",
          "--expense-ids is required",
          "create-snapshot"
        );

      return run("create-snapshot", async () => {
        const chatId = await resolveChatId(
          trpc,
          opts["chat-id"] as string | undefined
        );
        return trpc.snapshot.create.mutate({
          chatId,
          creatorId: Number(opts["creator-id"]),
          title: String(opts.title),
          expenseIds: String(opts["expense-ids"])
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        });
      });
    },
  },
  {
    name: "update-snapshot",
    description: "Modify an existing snapshot's title or associated expenses",
    options: {
      "snapshot-id": { type: "string", description: "The snapshot UUID" },
      "chat-id": { type: "string", description: "The numeric chat ID" },
      title: { type: "string", description: "Snapshot title" },
      "expense-ids": {
        type: "string",
        description: "Comma-separated expense UUIDs",
      },
    },
    execute: (opts, trpc) => {
      if (!opts["snapshot-id"])
        return error(
          "missing_option",
          "--snapshot-id is required",
          "update-snapshot"
        );
      if (!opts.title)
        return error(
          "missing_option",
          "--title is required",
          "update-snapshot"
        );
      if (!opts["expense-ids"])
        return error(
          "missing_option",
          "--expense-ids is required",
          "update-snapshot"
        );

      return run("update-snapshot", async () => {
        const chatId = await resolveChatId(
          trpc,
          opts["chat-id"] as string | undefined
        );
        return trpc.snapshot.update.mutate({
          snapshotId: String(opts["snapshot-id"]),
          chatId,
          title: String(opts.title),
          expenseIds: String(opts["expense-ids"])
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        });
      });
    },
  },
  {
    name: "delete-snapshot",
    description: "Delete an existing snapshot",
    options: {
      "snapshot-id": { type: "string", description: "The snapshot UUID" },
    },
    execute: (opts, trpc) => {
      if (!opts["snapshot-id"])
        return error(
          "missing_option",
          "--snapshot-id is required",
          "delete-snapshot"
        );

      return run("delete-snapshot", async () => {
        return trpc.snapshot.delete.mutate({
          snapshotId: String(opts["snapshot-id"]),
        });
      });
    },
  },
];
