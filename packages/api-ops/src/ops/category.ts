import { resolveChatId, type TrpcClient } from "@bananasplitz/api-client";

export async function listCategories(
  trpc: TrpcClient,
  input: { chatId?: string | number } = {}
) {
  const chatId = await resolveChatId(trpc, input.chatId?.toString());
  return trpc.category.listByChat.query({ chatId });
}
