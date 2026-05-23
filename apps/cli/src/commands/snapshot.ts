import type { Command } from "./types.js";
import { run } from "../output.js";
import {
  createSnapshot,
  deleteSnapshot,
  getSnapshot,
  listSnapshots,
  updateSnapshot,
  validateCreateSnapshotInput,
  validateSnapshotId,
  validateUpdateSnapshotInput,
} from "@bananasplitz/api-ops";

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
      run("list-snapshots", async () =>
        listSnapshots(trpc, {
          chatId: opts["chat-id"] as string | undefined,
        })
      ),
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
    execute: (opts, trpc) =>
      run("get-snapshot", async () =>
        getSnapshot(trpc, {
          snapshotId: validateSnapshotId(
            opts["snapshot-id"] as string | undefined
          ),
        })
      ),
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
    execute: (opts, trpc) =>
      run("create-snapshot", async () => {
        const validated = validateCreateSnapshotInput({
          creatorId: opts["creator-id"] as string | undefined,
          title: opts.title as string | undefined,
          expenseIds: opts["expense-ids"] as string | undefined,
        });
        return createSnapshot(trpc, {
          chatId: opts["chat-id"] as string | undefined,
          ...validated,
        });
      }),
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
    execute: (opts, trpc) =>
      run("update-snapshot", async () => {
        const validated = validateUpdateSnapshotInput({
          snapshotId: opts["snapshot-id"] as string | undefined,
          title: opts.title as string | undefined,
          expenseIds: opts["expense-ids"] as string | undefined,
        });
        return updateSnapshot(trpc, {
          chatId: opts["chat-id"] as string | undefined,
          ...validated,
        });
      }),
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
    execute: (opts, trpc) =>
      run("delete-snapshot", async () =>
        deleteSnapshot(trpc, {
          snapshotId: validateSnapshotId(
            opts["snapshot-id"] as string | undefined
          ),
        })
      ),
  },
];
