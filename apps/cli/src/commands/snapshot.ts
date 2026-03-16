import type { Command } from "./types.js";
import { resolveChatId } from "../scope.js";
import { run, error } from "../output.js";

export const snapshotCommands: Command[] = [
  {
    name: "list-snapshots",
    description: "List all expense snapshots in a chat",
    agentGuidance: "Use this to find a snapshot ID.",
    examples: ["banana list-snapshots"],
    options: {
      "chat-id": {
        type: "string",
        description: "The numeric chat ID (optional if API key is chat-scoped)",
        required: false,
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
    agentGuidance: "Use this to see which expenses are included in a snapshot.",
    examples: [
      "banana get-snapshot --snapshot-id 123e4567-e89b-12d3-a456-426614174000",
    ],
    options: {
      "snapshot-id": {
        type: "string",
        description: "The snapshot UUID",
        required: true,
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
    agentGuidance: "Use this to group expenses together.",
    examples: [
      "banana create-snapshot --creator-id 123 --title 'Trip to Japan' --expense-ids 'id1,id2'",
    ],
    options: {
      "chat-id": {
        type: "string",
        description: "The numeric chat ID",
        required: false,
      },
      "creator-id": {
        type: "string",
        description: "The user ID creating the snapshot",
        required: true,
      },
      title: { type: "string", description: "Snapshot title", required: true },
      "expense-ids": {
        type: "string",
        description: "Comma-separated expense UUIDs",
        required: true,
      },
    },
    execute: (opts, trpc) => {
      if (!opts["creator-id"])
        return error(
          "missing_option",
          "--creator-id is required",
          "create-snapshot"
        );
      if (Number.isNaN(Number(opts["creator-id"])))
        return error(
          "invalid_option",
          "--creator-id must be a valid number",
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
    agentGuidance: "Use this to add or remove expenses from a snapshot.",
    examples: [
      "banana update-snapshot --snapshot-id 123e4567-e89b-12d3-a456-426614174000 --title 'Trip to Japan' --expense-ids 'id1,id2,id3'",
    ],
    options: {
      "snapshot-id": {
        type: "string",
        description: "The snapshot UUID",
        required: true,
      },
      "chat-id": {
        type: "string",
        description: "The numeric chat ID",
        required: false,
      },
      title: { type: "string", description: "Snapshot title", required: true },
      "expense-ids": {
        type: "string",
        description: "Comma-separated expense UUIDs",
        required: true,
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
    agentGuidance:
      "Use this to remove a snapshot. The underlying expenses are not deleted.",
    examples: [
      "banana delete-snapshot --snapshot-id 123e4567-e89b-12d3-a456-426614174000",
    ],
    options: {
      "snapshot-id": {
        type: "string",
        description: "The snapshot UUID",
        required: true,
      },
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
