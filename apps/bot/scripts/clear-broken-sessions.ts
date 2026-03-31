import "dotenv/config";
import { PrismaClient } from "@dko/database";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env.DATABASE_URL ||
        "postgresql://postgres:postgres@localhost:5432/banana_split",
    },
  },
});

async function clearBrokenSessions() {
  console.log("Finding threads with broken Telegram image URLs...");

  const result = await prisma.$queryRaw<
    { thread_id: string }[]
  >`SELECT DISTINCT thread_id FROM mastra.memory 
    WHERE content::text LIKE '%api.telegram.org/file%'`;

  const threadIds = result.map((r) => r.thread_id);

  if (threadIds.length === 0) {
    console.log("No broken sessions found.");
    return;
  }

  console.log(`Found ${threadIds.length} sessions with broken images:`);
  for (const threadId of threadIds) {
    console.log(`  - ${threadId}`);
  }

  console.log("\nDeleting sessions...");

  for (const threadId of threadIds) {
    try {
      await prisma.$executeRaw`DELETE FROM mastra.memory WHERE thread_id = ${threadId}`;
      console.log(`  Deleted: ${threadId}`);
    } catch (error) {
      console.error(`  Failed to delete ${threadId}:`, error);
    }
  }

  console.log("\nDone!");
  await prisma.$disconnect();
}

clearBrokenSessions().catch(console.error);
