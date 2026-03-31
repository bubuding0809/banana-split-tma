import { PostgresStore } from "@mastra/pg";
import { Memory } from "@mastra/memory";

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/banana_split";

export const pgMemory = new Memory({
  storage: new PostgresStore({
    id: "agent-storage",
    connectionString,
    schemaName: "mastra",
  }),
});

export const memory = pgMemory;

export async function clearBrokenMemorySessions(): Promise<string[]> {
  const TELEGRAM_URL_PATTERN = "api.telegram.org/file";
  const deletedThreads: string[] = [];

  const { threads } = await pgMemory.listThreads({});

  for (const thread of threads) {
    try {
      const { messages } = await pgMemory.recall({
        threadId: thread.id,
        perPage: 100,
      });
      const contentStr = JSON.stringify(messages);

      if (contentStr.includes(TELEGRAM_URL_PATTERN)) {
        await pgMemory.deleteThread(thread.id);
        deletedThreads.push(thread.id);
      }
    } catch (error) {
      console.error(`Failed to process thread ${thread.id}:`, error);
    }
  }

  return deletedThreads;
}
