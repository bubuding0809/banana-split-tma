import { describe, it, expect } from "vitest";
import { inlineKeyboard } from "./telegram.js";

describe("inlineKeyboard", () => {
  it("wraps the buttons in a single row under reply_markup", () => {
    const buttons = [
      { text: "View Expense", url: "https://t.me/bot?startapp=x" },
      { text: "View Schedule", url: "https://t.me/bot?startapp=y" },
    ];
    expect(inlineKeyboard(buttons)).toEqual({
      reply_markup: { inline_keyboard: [buttons] },
    });
  });
});
