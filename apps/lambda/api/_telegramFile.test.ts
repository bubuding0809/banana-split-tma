import { describe, it, expect, vi } from "vitest";

// env.js validates at import time and the local env file is gitignored, so
// the vars have to exist before the module graph loads (as in _avatar.test.ts).
vi.hoisted(() => {
  process.env.TELEGRAM_BOT_TOKEN = "test-bot-token";
  process.env.API_KEY = "test-api-key";
  process.env.INTERNAL_AGENT_KEY = "test-internal-agent-key";
  process.env.RECURRING_EXPENSE_WEBHOOK_SECRET = "x".repeat(64);
  process.env.CRON_SECRET = "c".repeat(64);
  process.env.AWS_GROUP_REMINDER_LAMBDA_ARN =
    "arn:aws:lambda:ap-southeast-1:000000000000:function:GroupReminderLambda";
});

import { telegramFileUrl, fetchTelegramFile } from "./_telegramFile.js";

describe("telegramFileUrl", () => {
  it("builds the download URL against the default root", () => {
    expect(telegramFileUrl(undefined, "123:TOKEN", "photos/file_1.jpg")).toBe(
      "https://api.telegram.org/file/bot123:TOKEN/photos/file_1.jpg"
    );
  });
  it("honours a custom root and strips a trailing slash", () => {
    expect(
      telegramFileUrl("http://127.0.0.1:8082/", "123:TOKEN", "a/b.jpg")
    ).toBe("http://127.0.0.1:8082/file/bot123:TOKEN/a/b.jpg");
  });
});

describe("fetchTelegramFile", () => {
  it("throws when Telegram returns no file_path", async () => {
    const teleBot = { getFile: vi.fn().mockResolvedValue({ file_id: "x" }) };
    await expect(fetchTelegramFile(teleBot as never, "x")).rejects.toThrow(
      "file_path"
    );
  });
});
