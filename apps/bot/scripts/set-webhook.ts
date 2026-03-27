async function setWebhook() {
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
    console.log("Skipping webhook setup for non-production environment.");
    return;
  }

  // Fallback gracefully instead of failing the build
  if (!process.env.VERCEL_URL) {
    console.warn("⚠️ VERCEL_URL is not set. Skipping webhook setup.");
    return;
  }

  // Dynamic import so env validation doesn't run during preview builds
  const { bot } = await import("../src/bot.js");

  const url = `https://${process.env.VERCEL_URL}/api/webhook`;
  console.log(`Setting webhook to: ${url}`);

  await bot.api.setWebhook(url);
  console.log("Webhook set successfully!");
}

setWebhook().catch((error) => {
  console.error("Failed to set webhook:", error);
});
