import "dotenv/config";
import { clearBrokenMemorySessions } from "@repo/agent";

async function main() {
  console.log("Finding and clearing broken Mastra sessions...\n");

  const deletedThreads = await clearBrokenMemorySessions();

  if (deletedThreads.length === 0) {
    console.log("No broken sessions found.");
    return;
  }

  console.log(`\nDeleted ${deletedThreads.length} sessions:`);
  for (const threadId of deletedThreads) {
    console.log(`  - ${threadId}`);
  }
}

main().catch(console.error);
