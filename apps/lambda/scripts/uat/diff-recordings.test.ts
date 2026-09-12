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

  it("(a) ignores message_thread_id on the response side", () => {
    const a = [
      entry(
        1,
        "sendMessage",
        { chat_id: 1, message_thread_id: 5, text: "hi" },
        { ok: true, result: { message_thread_id: 1915, text: "hi" } }
      ),
    ];
    const b = [
      entry(
        1,
        "sendMessage",
        { chat_id: 1, message_thread_id: 5, text: "hi" },
        { ok: true, result: { message_thread_id: 1919, text: "hi" } }
      ),
    ];
    expect(diffRecordings(a, b)).toEqual([]);
  });

  it("(b) still reports a request-side message_thread_id difference", () => {
    const a = [
      entry(
        1,
        "sendMessage",
        { chat_id: 1, message_thread_id: 5, text: "hi" },
        { ok: true, result: { text: "hi" } }
      ),
    ];
    const b = [
      entry(
        1,
        "sendMessage",
        { chat_id: 1, message_thread_id: 9, text: "hi" },
        { ok: true, result: { text: "hi" } }
      ),
    ];
    const problems = diffRecordings(a, b);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("request differs");
  });

  it("(c) treats a swapped consecutive same-method run as no difference", () => {
    const a = [
      entry(
        1,
        "getChatMember",
        { chat_id: -100, user_id: 1 },
        { ok: true, result: { user: { id: 1 } } }
      ),
      entry(
        2,
        "getChatMember",
        { chat_id: -100, user_id: 2 },
        { ok: true, result: { user: { id: 2 } } }
      ),
    ];
    const b = [
      entry(
        1,
        "getChatMember",
        { chat_id: -100, user_id: 2 },
        { ok: true, result: { user: { id: 2 } } }
      ),
      entry(
        2,
        "getChatMember",
        { chat_id: -100, user_id: 1 },
        { ok: true, result: { user: { id: 1 } } }
      ),
    ];
    expect(diffRecordings(a, b)).toEqual([]);
  });

  it("(d) still catches a genuine change hidden inside a swapped run", () => {
    const a = [
      entry(
        1,
        "getChatMember",
        { chat_id: -100, user_id: 1 },
        { ok: true, result: { user: { id: 1 } } }
      ),
      entry(
        2,
        "getChatMember",
        { chat_id: -100, user_id: 2 },
        { ok: true, result: { user: { id: 2 } } }
      ),
    ];
    const b = [
      entry(
        1,
        "getChatMember",
        { chat_id: -100, user_id: 2 },
        { ok: true, result: { user: { id: 2 } } }
      ),
      entry(
        2,
        "getChatMember",
        { chat_id: -100, user_id: 9 },
        { ok: true, result: { user: { id: 9 } } }
      ),
    ];
    const problems = diffRecordings(a, b);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.some((p) => p.includes("request differs"))).toBe(true);
  });

  it("(e) does not reorder same-method entries across a different-method separator", () => {
    const a = [
      entry(
        1,
        "getChatMember",
        { chat_id: -100, user_id: 1 },
        { ok: true, result: {} }
      ),
      entry(2, "getMe", {}, { ok: true, result: {} }),
      entry(
        3,
        "getChatMember",
        { chat_id: -100, user_id: 2 },
        { ok: true, result: {} }
      ),
    ];
    const b = [
      entry(
        1,
        "getChatMember",
        { chat_id: -100, user_id: 2 },
        { ok: true, result: {} }
      ),
      entry(2, "getMe", {}, { ok: true, result: {} }),
      entry(
        3,
        "getChatMember",
        { chat_id: -100, user_id: 1 },
        { ok: true, result: {} }
      ),
    ];
    // The two getChatMember runs are separated by getMe, so each is a
    // run of length 1 and must NOT be reordered against each other —
    // pairing stays positional and both slots report a request diff.
    const problems = diffRecordings(a, b);
    expect(problems.filter((p) => p.includes("request differs"))).toHaveLength(
      2
    );
  });
});
