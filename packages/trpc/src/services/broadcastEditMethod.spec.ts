import { describe, expect, it } from "vitest";
import { selectEditMethod } from "./broadcastEditMethod.js";

describe("selectEditMethod", () => {
  it("text → text uses editMessageText", () => {
    expect(
      selectEditMethod({ currentKind: null, nextText: "hi", nextMedia: false })
    ).toEqual({ method: "editMessageText" });
  });
  it("photo + only new caption uses editMessageCaption", () => {
    expect(
      selectEditMethod({
        currentKind: "PHOTO",
        nextText: "hi",
        nextMedia: false,
      })
    ).toEqual({ method: "editMessageCaption" });
  });
  it("photo + new media uses editMessageMedia", () => {
    expect(
      selectEditMethod({
        currentKind: "PHOTO",
        nextText: "cap",
        nextMedia: true,
      })
    ).toEqual({ method: "editMessageMedia" });
  });
  it("text → media is rejected", () => {
    expect(
      selectEditMethod({ currentKind: null, nextText: "hi", nextMedia: true })
    ).toEqual({ method: null, error: "cannot_add_media_to_text" });
  });
  it("media → no-media is rejected", () => {
    expect(
      selectEditMethod({
        currentKind: "PHOTO",
        nextText: "hi",
        nextMedia: false,
        removeMedia: true,
      })
    ).toEqual({ method: null, error: "cannot_remove_media" });
  });
});
