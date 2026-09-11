import { describe, it, expect } from "vitest";
import {
  diffRecordings,
  normalize,
  type RecordedEntry,
} from "./diff-recordings.js";

const entry = (
  seq: number,
  method: string,
  request: Record<string, unknown>,
  response: unknown
): RecordedEntry => ({ seq, method, request, response });

describe("normalize", () => {
  it("drops volatile keys, masks ids in deep links, and sorts keys", () => {
    const value = {
      text: "x",
      chat_id: 5,
      message_id: 9,
      reply_markup: {
        inline_keyboard: [
          [{ url: "https://t.me/bot?startapp=v1_g_abc_e_XyZ", text: "View" }],
          [
            {
              callback_data: "s:123e4567-e89b-12d3-a456-426614174000:cat",
              text: "Cat",
            },
          ],
        ],
      },
    };
    expect(JSON.stringify(normalize(value))).toBe(
      JSON.stringify({
        chat_id: 5,
        reply_markup: {
          inline_keyboard: [
            [{ text: "View", url: "https://t.me/bot?startapp=<payload>" }],
            [{ callback_data: "s:<uuid>:cat", text: "Cat" }],
          ],
        },
        text: "x",
      })
    );
  });
});

describe("diffRecordings", () => {
  it("returns no problems when entries differ only in volatile fields", () => {
    const a = [
      entry(
        1,
        "sendMessage",
        { chat_id: 1, text: "hi", parse_mode: "MarkdownV2" },
        {
          ok: true,
          result: { message_id: 10, date: 1, text: "hi", entities: [] },
        }
      ),
    ];
    const b = [
      entry(
        1,
        "sendMessage",
        { parse_mode: "MarkdownV2", text: "hi", chat_id: 1 },
        {
          ok: true,
          result: { message_id: 11, date: 2, text: "hi", entities: [] },
        }
      ),
    ];
    expect(diffRecordings(a, b)).toEqual([]);
  });

  it("reports request and response differences and length mismatches", () => {
    const a = [
      entry(
        1,
        "sendMessage",
        { chat_id: 1, text: "hi" },
        { result: { text: "hi" } }
      ),
      entry(2, "deleteMessage", { chat_id: 1 }, { result: true }),
    ];
    const b = [
      entry(
        1,
        "sendMessage",
        { chat_id: 1, text: "bye" },
        { result: { text: "bye" } }
      ),
    ];
    const problems = diffRecordings(a, b);
    expect(problems).toHaveLength(3);
    expect(problems[0]).toContain("request differs");
    expect(problems[1]).toContain("response differs");
    expect(problems[2]).toContain("missing in candidate");
  });
});
