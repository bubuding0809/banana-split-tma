import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { makePng } from "./png.js";

describe("makePng", () => {
  it("emits a PNG with the requested dimensions and is deterministic", () => {
    const a = makePng(128, 64, [255, 204, 0]);
    const b = makePng(128, 64, [255, 204, 0]);
    expect(a.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
    expect(a.subarray(12, 16).toString("ascii")).toBe("IHDR");
    expect(a.readUInt32BE(16)).toBe(128);
    expect(a.readUInt32BE(20)).toBe(64);
    expect(a.subarray(a.length - 8, a.length - 4).toString("ascii")).toBe(
      "IEND"
    );
    expect(createHash("sha256").update(a).digest("hex")).toBe(
      createHash("sha256").update(b).digest("hex")
    );
  });
});
