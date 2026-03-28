import { PostgresStore } from "@mastra/pg";
import { Memory } from "@mastra/memory";

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/banana_split";

export const pgMemory = new Memory({
  options: {
    lastMessages: 15, // Keep context window manageable to avoid 131k token limits
  },
  storage: new PostgresStore({
    id: "agent-storage",
    connectionString,
    schemaName: "mastra", // Ensure it doesn't conflict with Prisma migrations in the public schema
  }),
});

export const memory = pgMemory;
