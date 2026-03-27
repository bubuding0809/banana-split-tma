import { serializeToolResult } from "../serialize.js";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { createTrpcCaller } from "../trpc.js";
import { withToolErrorHandling } from "../utils.js";

export const listSnapshotsTool = createTool({
  id: "listSnapshotsTool",
  description: "List all expense snapshots in a chat.",
  inputSchema: z.object({}),
  execute: withToolErrorHandling(async (data, context) => {
    const { caller, chatId } = createTrpcCaller(context);
    const result = await caller.snapshot.getByChat({ chatId });
    return serializeToolResult(result);
  }),
});

export const getSnapshotTool = createTool({
  id: "getSnapshotTool",
  description: "Get detailed information about a specific snapshot.",
  inputSchema: z.object({
    snapshotId: z.string().describe("The UUID of the snapshot to retrieve"),
  }),
  execute: withToolErrorHandling(async (data, context) => {
    const { caller } = createTrpcCaller(context);
    const result = await caller.snapshot.getDetails({
      snapshotId: data.snapshotId,
    });
    return serializeToolResult(result);
  }),
});

export const createSnapshotTool = createTool({
  id: "createSnapshotTool",
  description:
    "Create an expense snapshot combining multiple specific expenses.",
  inputSchema: z.object({
    title: z.string().describe("Snapshot title"),
    expenseIds: z
      .array(z.string())
      .describe("List of expense UUIDs to include"),
  }),
  execute: withToolErrorHandling(async (data, context) => {
    const { caller, chatId, telegramUserId } = createTrpcCaller(context);
    const result = await caller.snapshot.create({
      chatId,
      creatorId: telegramUserId,
      title: data.title,
      expenseIds: data.expenseIds,
    });
    return serializeToolResult(result);
  }),
});

export const updateSnapshotTool = createTool({
  id: "updateSnapshotTool",
  description: "Modify an existing snapshot's title or associated expenses.",
  inputSchema: z.object({
    snapshotId: z.string().describe("The snapshot UUID"),
    title: z.string().describe("Snapshot title"),
    expenseIds: z
      .array(z.string())
      .describe("List of expense UUIDs to include"),
  }),
  execute: withToolErrorHandling(async (data, context) => {
    const { caller, chatId } = createTrpcCaller(context);
    const result = await caller.snapshot.update({
      snapshotId: data.snapshotId,
      chatId,
      title: data.title,
      expenseIds: data.expenseIds,
    });
    return serializeToolResult(result);
  }),
});

export const deleteSnapshotTool = createTool({
  id: "deleteSnapshotTool",
  description: "Delete an existing snapshot.",
  inputSchema: z.object({
    snapshotId: z.string().describe("The snapshot UUID"),
  }),
  execute: withToolErrorHandling(async (data, context) => {
    const { caller } = createTrpcCaller(context);
    const result = await caller.snapshot.delete({
      snapshotId: data.snapshotId,
    });
    return serializeToolResult(result);
  }),
});
