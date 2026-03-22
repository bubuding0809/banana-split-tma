import { prisma } from "../src/client.js";

const DEFAULT_CATEGORIES = [
  { name: "Outside food", icon: "🍔" },
  { name: "Groceries", icon: "🥬" },
  { name: "Household", icon: "🪜" },
  { name: "Work Lunch", icon: "🏗️" },
  { name: "Shopping", icon: "🛍️" },
  { name: "Transport", icon: "🚕" },
  { name: "Entertainment", icon: "🤑" },
  { name: "Travel", icon: "✈️" },
];

async function main() {
  console.log("Start seeding global categories...");

  for (const cat of DEFAULT_CATEGORIES) {
    const existing = await prisma.category.findFirst({
      where: { chatId: null, name: cat.name },
    });

    if (!existing) {
      await prisma.category.create({
        data: { name: cat.name, icon: cat.icon },
      });
      console.log(`Created global category: ${cat.name} ${cat.icon}`);
    } else {
      console.log(`Global category already exists: ${cat.name} ${cat.icon}`);
    }
  }

  console.log("Seeding finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
