import { resolveChatId, type TrpcClient } from "@bananasplitz/api-client";
import { invalidField, missingField } from "../errors.js";

export async function listSnapshots(
  trpc: TrpcClient,
  input: { chatId?: string | number } = {}
) {
  const chatId = await resolveChatId(trpc, input.chatId?.toString());
  return trpc.snapshot.getByChat.query({ chatId });
}

export async function getSnapshot(
  trpc: TrpcClient,
  input: { snapshotId: string }
) {
  return trpc.snapshot.getDetails.query({ snapshotId: input.snapshotId });
}

export async function createSnapshot(
  trpc: TrpcClient,
  input: {
    chatId?: string | number;
    creatorId: number;
    title: string;
    expenseIds: string[];
  }
) {
  const chatId = await resolveChatId(trpc, input.chatId?.toString());
  return trpc.snapshot.create.mutate({
    chatId,
    creatorId: input.creatorId,
    title: input.title,
    expenseIds: input.expenseIds,
  });
}

export async function updateSnapshot(
  trpc: TrpcClient,
  input: {
    snapshotId: string;
    chatId?: string | number;
    title: string;
    expenseIds: string[];
  }
) {
  const chatId = await resolveChatId(trpc, input.chatId?.toString());
  return trpc.snapshot.update.mutate({
    snapshotId: input.snapshotId,
    chatId,
    title: input.title,
    expenseIds: input.expenseIds,
  });
}

export async function deleteSnapshot(
  trpc: TrpcClient,
  input: { snapshotId: string }
) {
  return trpc.snapshot.delete.mutate({ snapshotId: input.snapshotId });
}

export function validateSnapshotId(snapshotId?: string): string {
  if (!snapshotId) missingField("--snapshot-id is required");
  return snapshotId;
}

export function validateCreateSnapshotInput(input: {
  creatorId?: string | number;
  title?: string;
  expenseIds?: string;
}): { creatorId: number; title: string; expenseIds: string[] } {
  if (!input.creatorId) missingField("--creator-id is required");
  if (Number.isNaN(Number(input.creatorId))) {
    invalidField("--creator-id must be a valid number");
  }
  if (!input.title) missingField("--title is required");
  if (!input.expenseIds) missingField("--expense-ids is required");
  return {
    creatorId: Number(input.creatorId),
    title: String(input.title),
    expenseIds: String(input.expenseIds)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

export function validateUpdateSnapshotInput(input: {
  snapshotId?: string;
  title?: string;
  expenseIds?: string;
}): { snapshotId: string; title: string; expenseIds: string[] } {
  if (!input.snapshotId) missingField("--snapshot-id is required");
  if (!input.title) missingField("--title is required");
  if (!input.expenseIds) missingField("--expense-ids is required");
  return {
    snapshotId: String(input.snapshotId),
    title: String(input.title),
    expenseIds: String(input.expenseIds)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}
