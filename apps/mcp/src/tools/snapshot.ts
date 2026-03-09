import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { trpc } from "../client.js";
import { toolHandler } from "./utils.js";

export function registerSnapshotTools(server: McpServer) {
  server.registerTool(
    "banana_list_snapshots",
    {
      title: "List Snapshots",
      description:
        "List all expense snapshots in a chat. Snapshots group expenses together " +
        "for a time period or event. Returns snapshot title, creator, and expense count.",
      inputSchema: {
        chat_id: z.number().describe("The numeric chat ID."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    toolHandler("banana_list_snapshots", async ({ chat_id }) => {
      const snapshots = await trpc.snapshot.getByChat.query({
        chatId: chat_id,
      });
      if (snapshots.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No snapshots found." }],
        };
      }
      const text = snapshots
        .map((s) => {
          const expenseCount = s.expenses?.length ?? 0;
          return `- **${s.title || "Untitled"}** by ${s.creator?.firstName || "Unknown"} (${expenseCount} expenses) [ID: ${s.id}]`;
        })
        .join("\n");
      return {
        content: [
          {
            type: "text" as const,
            text: `**Snapshots (${snapshots.length}):**\n${text}`,
          },
        ],
      };
    })
  );

  server.registerTool(
    "banana_get_snapshot",
    {
      title: "Get Snapshot Details",
      description:
        "Get full details of a specific snapshot including all expenses within it, " +
        "their amounts, payers, and split details.",
      inputSchema: {
        snapshot_id: z.string().describe("The snapshot UUID."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    toolHandler("banana_get_snapshot", async ({ snapshot_id }) => {
      const snapshot = await trpc.snapshot.getDetails.query({
        snapshotId: snapshot_id,
      });
      // Using `as any` because the return type has some unconverted BigInt fields
      // (telegramMessageId, threadId) in nested objects, making TypeScript
      // inference messy. Since MCP output is text-formatted, this is acceptable.
      const s = snapshot as any;
      const expenses = (s.expenses || [])
        .map(
          (e: any) =>
            `  - ${e.description || "Untitled"}: ${e.amount} ${e.currency} (paid by ${e.payer?.firstName || e.payerId})`
        )
        .join("\n");
      const text =
        `**Snapshot: ${s.title || "Untitled"}**\n` +
        `Chat: ${s.chat?.title || s.chatId}\n` +
        `Created by: ${s.creator?.firstName || "Unknown"}\n` +
        `Expenses (${s.expenses?.length || 0}):\n${expenses || "  None"}`;
      return {
        content: [{ type: "text" as const, text }],
      };
    })
  );
}
