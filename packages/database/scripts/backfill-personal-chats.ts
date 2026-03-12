import { ChatType, PrismaClient } from "../generated/client/index.js";

async function backfillPersonalChats() {
  const db = new PrismaClient();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set. Exiting.");
    process.exit(1);
  }
  try {
    const url = new URL(databaseUrl);
    console.log(`Target database: ${url.hostname}${url.pathname}`);
  } catch {
    console.log("Target database: (unable to parse DATABASE_URL)");
  }

  try {
    console.log("Starting backfill of personal chats...");

    const users = await db.user.findMany({
      select: { id: true, firstName: true },
    });

    console.log(`Found ${users.length} users to process.`);

    let created = 0;
    let skipped = 0;
    let failed = 0;

    for (const user of users) {
      try {
        // Check if personal chat already exists
        const existingChat = await db.chat.findUnique({
          where: { id: user.id },
        });

        if (existingChat) {
          // Chat with this ID already exists
          if (existingChat.type === ChatType.private) {
            skipped++;
            continue;
          }
          // If a non-private chat has the same ID as a user, that's unexpected.
          // Log it and skip.
          console.warn(
            `Chat ${user.id} exists but is type "${existingChat.type}", not "private". Skipping.`
          );
          skipped++;
          continue;
        }

        await db.chat.create({
          data: {
            id: user.id,
            title: user.firstName,
            type: "private",
            members: {
              connect: { id: user.id },
            },
          },
        });

        created++;
        console.log(
          `Created personal chat for user ${user.id} (${user.firstName})`
        );
      } catch (error) {
        failed++;
        console.error(
          `Failed to create personal chat for user ${user.id}:`,
          error
        );
      }
    }

    console.log(`\nBackfill complete:`);
    console.log(`  Created: ${created}`);
    console.log(`  Skipped: ${skipped}`);
    console.log(`  Failed: ${failed}`);
  } finally {
    await db.$disconnect();
  }
}

backfillPersonalChats().catch((error) => {
  console.error("Backfill script failed:", error);
  process.exit(1);
});
