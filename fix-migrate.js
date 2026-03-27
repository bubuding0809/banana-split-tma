const fs = require("fs");

let file = "packages/trpc/src/routers/chat/migrateChat.ts";
let content = fs.readFileSync(file, "utf8");

content = content.replace(
  `    if (existingNewChat) {
      return {
        status: 200,
        message: \`Chat \${newChatId} already exists, skipping migration.\`,
        migratedRecords: {
          expenses: 0,
          settlements: 0,
          snapshots: 0,
          schedules: 0,
        },
      };
    }`,
  `    if (existingNewChat) {
      // The race condition caused the new chat to be created already.
      // We must explicitly merge the records and delete the old chat.
      const migrationResult = await db.$transaction(async (tx) => {
        const expenseCount = await tx.expense.count({ where: { chatId: oldChatId } });
        const settlementCount = await tx.settlement.count({ where: { chatId: oldChatId } });
        const snapshotCount = await tx.expenseSnapshot.count({ where: { chatId: oldChatId } });

        // Reassign all related records to the newly created chat
        await tx.expense.updateMany({ where: { chatId: oldChatId }, data: { chatId: newChatId } });
        await tx.settlement.updateMany({ where: { chatId: oldChatId }, data: { chatId: newChatId } });
        await tx.expenseSnapshot.updateMany({ where: { chatId: oldChatId }, data: { chatId: newChatId } });
        
        // Re-link users
        const oldChat = await tx.chat.findUnique({ where: { id: oldChatId }, include: { members: true } });
        if (oldChat && oldChat.members.length > 0) {
          const userIds = oldChat.members.map(m => ({ id: m.id }));
          await tx.chat.update({
            where: { id: newChatId },
            data: { members: { connect: userIds } }
          });
        }

        // Delete the old chat
        await tx.chat.delete({ where: { id: oldChatId } });

        return {
          expenses: expenseCount,
          settlements: settlementCount,
          snapshots: snapshotCount,
          schedules: 0,
        };
      });
      
      return {
        status: 200,
        message: \`Successfully merged existing chat \${oldChatId} into new chat \${newChatId}\`,
        migratedRecords: migrationResult
      };
    }`
);

fs.writeFileSync(file, content);
