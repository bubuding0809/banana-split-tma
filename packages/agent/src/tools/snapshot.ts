import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { createTrpcCaller } from "../trpc.js";

export const getSnapshotTool = createTool({
  id: "getSnapshotTool",
  description: "Get detailed information about a specific snapshot.",
  inputSchema: z.object({
    snapshotId: z.string().describe("The UUID of the snapshot to retrieve"),
  }),
  execute: async (data, context) => {
    const { caller } = createTrpcCaller(context);
    // Note: The instruction asked for getSnapshot.query({ telegramUserId })
    // but the router exposes getDetails({ snapshotId })
    const result = await caller.snapshot.getDetails({
      snapshotId: data.snapshotId,
    });
    return JSON.stringify(result);
  },
});
