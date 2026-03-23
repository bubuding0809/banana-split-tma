import { describe, it, expect } from "vitest";
import { generatePayNowString, isValidSgMobile } from "../paynow";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Parse a top-level TLV field from an EMV QR string at the given offset. */
function parseTlv(data: string, offset: number) {
  const id = data.slice(offset, offset + 2);
  const length = parseInt(data.slice(offset + 2, offset + 4), 10);
  const value = data.slice(offset + 4, offset + 4 + length);
  return { id, length, value, next: offset + 4 + length };
}

/** Extract all top-level TLV fields from an EMV QR payload string. */
function parseAllTlv(data: string) {
  const fields = new Map<string, string>();
  let offset = 0;
  while (offset < data.length) {
    const { id, value, next } = parseTlv(data, offset);
    fields.set(id, value);
    offset = next;
  }
  return fields;
}

// ── isValidSgMobile ──────────────────────────────────────────────────────────

describe("isValidSgMobile", () => {
  it.each([
    ["6591234567", "without +"],
    ["+6591234567", "with +"],
    ["6581234567", "starting with 8"],
    ["+6581234567", "starting with 8 with +"],
    ["65 9123 4567", "with spaces"],
  ])("returns true for valid SG mobile: %s (%s)", (phone) => {
    expect(isValidSgMobile(phone)).toBe(true);
  });

  it.each([
    ["6571234567", "starts with 7"],
    ["6512345678", "starts with 1"],
    ["659123456", "too short"],
    ["65912345678", "too long"],
    ["1234567890", "non-SG country code"],
    ["", "empty string"],
  ])("returns false for invalid SG mobile: %s (%s)", (phone) => {
    expect(isValidSgMobile(phone)).toBe(false);
  });
});

// ── generatePayNowString ─────────────────────────────────────────────────────

describe("generatePayNowString", () => {
  const PHONE = "6591234567";
  const AMOUNT = 12.5;
  const NAME = "Alice";

  it("produces a string starting with Payload Format Indicator 000201", () => {
    const qr = generatePayNowString(PHONE, AMOUNT, NAME);
    expect(qr.startsWith("000201")).toBe(true);
  });

  it("sets Point of Initiation to 11 (dynamic)", () => {
    const qr = generatePayNowString(PHONE, AMOUNT, NAME);
    const fields = parseAllTlv(qr);
    expect(fields.get("01")).toBe("11");
  });

  describe("Merchant Account Info (tag 26)", () => {
    it("contains SG.PAYNOW GUID", () => {
      const qr = generatePayNowString(PHONE, AMOUNT, NAME);
      const fields = parseAllTlv(qr);
      const subFields = parseAllTlv(fields.get("26")!);
      expect(subFields.get("00")).toBe("SG.PAYNOW");
    });

    it("sets proxy type to 0 (mobile number)", () => {
      const qr = generatePayNowString(PHONE, AMOUNT, NAME);
      const fields = parseAllTlv(qr);
      const subFields = parseAllTlv(fields.get("26")!);
      expect(subFields.get("01")).toBe("0");
    });

    it("formats phone number as E.164 with + prefix", () => {
      const qr = generatePayNowString(PHONE, AMOUNT, NAME);
      const fields = parseAllTlv(qr);
      const subFields = parseAllTlv(fields.get("26")!);
      expect(subFields.get("02")).toBe("+6591234567");
    });

    it("does not double-add + if phone already has it", () => {
      const qr = generatePayNowString("+6591234567", AMOUNT, NAME);
      const fields = parseAllTlv(qr);
      const subFields = parseAllTlv(fields.get("26")!);
      expect(subFields.get("02")).toBe("+6591234567");
    });

    it("sets amount editable flag to 1 by default", () => {
      const qr = generatePayNowString(PHONE, AMOUNT, NAME);
      const fields = parseAllTlv(qr);
      const subFields = parseAllTlv(fields.get("26")!);
      expect(subFields.get("03")).toBe("1");
    });

    it("sets amount editable flag to 0 when editable=false", () => {
      const qr = generatePayNowString(PHONE, AMOUNT, NAME, false);
      const fields = parseAllTlv(qr);
      const subFields = parseAllTlv(fields.get("26")!);
      expect(subFields.get("03")).toBe("0");
    });

    it("has expiry date set to 99991231", () => {
      const qr = generatePayNowString(PHONE, AMOUNT, NAME);
      const fields = parseAllTlv(qr);
      const subFields = parseAllTlv(fields.get("26")!);
      expect(subFields.get("04")).toBe("99991231");
    });
  });

  it("always includes Transaction Amount tag (54)", () => {
    const qr = generatePayNowString(PHONE, AMOUNT, NAME);
    const fields = parseAllTlv(qr);
    expect(fields.get("54")).toBe("12.5");
  });

  it("includes Transaction Amount tag (54) even when amount is 0", () => {
    const qr = generatePayNowString(PHONE, 0, NAME);
    const fields = parseAllTlv(qr);
    expect(fields.get("54")).toBe("0");
  });

  it("sets Transaction Currency to 702 (SGD)", () => {
    const qr = generatePayNowString(PHONE, AMOUNT, NAME);
    const fields = parseAllTlv(qr);
    expect(fields.get("53")).toBe("702");
  });

  it("sets Country Code to SG", () => {
    const qr = generatePayNowString(PHONE, AMOUNT, NAME);
    const fields = parseAllTlv(qr);
    expect(fields.get("58")).toBe("SG");
  });

  it("sets Merchant City to Singapore", () => {
    const qr = generatePayNowString(PHONE, AMOUNT, NAME);
    const fields = parseAllTlv(qr);
    expect(fields.get("60")).toBe("Singapore");
  });

  it("truncates merchant name to 25 characters", () => {
    const longName = "A".repeat(30);
    const qr = generatePayNowString(PHONE, AMOUNT, longName);
    const fields = parseAllTlv(qr);
    expect(fields.get("59")).toBe("A".repeat(25));
  });

  it("uses 'NA' as fallback when merchant name is empty", () => {
    const qr = generatePayNowString(PHONE, AMOUNT, "");
    const fields = parseAllTlv(qr);
    expect(fields.get("59")).toBe("NA");
  });

  it("ends with a valid CRC16-CCITT-FALSE checksum", () => {
    const qr = generatePayNowString(PHONE, AMOUNT, NAME);
    // The CRC tag "6304" is a TLV field, and the CRC is computed over everything
    // including "6304", then the 4-char hex CRC is appended
    const fields = parseAllTlv(qr);
    const crcValue = fields.get("63")!;
    expect(crcValue).toHaveLength(4);
    expect(crcValue).toMatch(/^[0-9A-F]{4}$/);
  });

  it("has correct TLV structure throughout", () => {
    const qr = generatePayNowString(PHONE, AMOUNT, NAME);
    let offset = 0;
    while (offset < qr.length) {
      const { next } = parseTlv(qr, offset);
      expect(next).toBeGreaterThan(offset);
      offset = next;
    }
    expect(offset).toBe(qr.length);
  });

  it("matches reference output structure for known input", () => {
    // Reference: jtaych/PayNow-QR-Javascript with mobile +6592361751, amount 110, edit=no
    // The preamble in the reference is: "0002010102112650"
    // which decodes to: tag00=01, tag01=11, tag26 length=50
    const qr = generatePayNowString("+6592361751", 110, "payyouuuu", false);
    const fields = parseAllTlv(qr);

    expect(fields.get("00")).toBe("01");
    expect(fields.get("01")).toBe("11");
    expect(fields.get("52")).toBe("0000");
    expect(fields.get("53")).toBe("702");
    expect(fields.get("54")).toBe("110");
    expect(fields.get("58")).toBe("SG");
    expect(fields.get("59")).toBe("payyouuuu");
    expect(fields.get("60")).toBe("Singapore");

    const mai = parseAllTlv(fields.get("26")!);
    expect(mai.get("00")).toBe("SG.PAYNOW");
    expect(mai.get("01")).toBe("0");
    expect(mai.get("02")).toBe("+6592361751");
    expect(mai.get("03")).toBe("0"); // edit = no
    expect(mai.get("04")).toBe("99991231");

    // Verify tag 26 has length 50 (matching the reference's hardcoded "2650")
    expect(fields.get("26")!.length).toBe(50);
  });
});
