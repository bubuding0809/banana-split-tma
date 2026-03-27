async function setCommands() {
  // Prevent running in Vercel preview environments so we don't accidentally
  // update the global production bot commands while testing a PR.
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
    console.log(
      "Skipping command registration for non-production environment."
    );
    return;
  }

  // Graceful skip if running locally without a bot token
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.warn("⚠️ TELEGRAM_BOT_TOKEN is not set. Skipping command setup.");
    return;
  }

  // Dynamic import so env validation doesn't run during preview builds
  const { bot } = await import("../src/bot.js");

  console.log("Setting bot commands...");

  // Default commands for private chats
  await bot.api.setMyCommands(
    [
      { command: "start", description: "Start using the bot" },
      {
        command: "ask",
        description: "Talk to the AI agent / record custom expenses",
      },
      { command: "list", description: "See your personal expense history" },
      { command: "stats", description: "See your personal spending summary" },
      {
        command: "help",
        description: "Get instructions on how to use the bot",
      },
      { command: "pin", description: "Pin the Mini App to the chat" },
    ],
    { scope: { type: "all_private_chats" } }
  );

  // Default commands for group chats
  await bot.api.setMyCommands(
    [
      { command: "start", description: "Start using the bot" },
      {
        command: "ask",
        description: "Talk to the AI agent / record group expenses",
      },
      { command: "pin", description: "Pin the Mini App to the chat" },
      {
        command: "summary",
        description: "Get a summary of all unsettled group expenses",
      },
      {
        command: "balance",
        description: "Get current balances and settle debts",
      },
      {
        command: "set_topic",
        description: "Set the active topic/thread for the bot",
      },
      {
        command: "help",
        description: "Get instructions on how to use the bot",
      },
    ],
    { scope: { type: "all_group_chats" } }
  );

  console.log("Bot commands set successfully!");
}

setCommands().catch((error) => {
  console.error("Failed to set commands:", error);
});
