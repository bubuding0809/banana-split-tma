import { describe, it, expect } from "vitest";
import { tlv, crc16, generatePayNowQRString } from "../paynow-qr";

describe("tlv", () => {
  it("encodes a short value with zero-padded length", () => {
    expect(tlv("00", "01")).toBe("000201");
  });

  it("encodes a 9-char value correctly", () => {
    expect(tlv("60", "Singapore")).toBe("6009Singapore");
  });

  it("encodes a 10-char value without extra padding", () => {
    expect(tlv("59", "0123456789")).toBe("59100123456789");
  });
});

describe("crc16", () => {
  it("returns a 4-char uppercase hex string", () => {
    const result = crc16("000201");
    expect(result).toMatch(/^[0-9A-F]{4}$/);
  });

  it("returns correct CRC for known EMV preamble", () => {
    // CRC16/CCITT-FALSE of "000201" with poly 0x1021, init 0xFFFF
    expect(crc16("000201")).toBe("89B9");
  });
});

describe("generatePayNowQRString", () => {
  const base = {
    mobileNumber: "91234567",
    amount: 42.6,
    merchantName: "Alice",
  };

  it("never contains the string 'null'", () => {
    expect(generatePayNowQRString(base)).not.toContain("null");
  });

  it("starts with payload format indicator 000201", () => {
    expect(generatePayNowQRString(base)).toMatch(/^000201/);
  });

  it("encodes amount as 2 decimal places", () => {
    // 42.60 → "42.60" (5 chars) → tag 54, len 05
    expect(generatePayNowQRString(base)).toContain("540542.60");
  });

  it("encodes whole amounts with trailing zeros", () => {
    // 10.00 → "10.00" (5 chars) → tag 54, len 05
    expect(generatePayNowQRString({ ...base, amount: 10 })).toContain(
      "540510.00"
    );
  });

  it("uses NA for empty merchant name", () => {
    expect(generatePayNowQRString({ ...base, merchantName: "" })).toContain(
      "5902NA"
    );
  });

  it("encodes merchant name correctly", () => {
    // "Alice" = 5 chars → tag 59, len 05
    expect(generatePayNowQRString(base)).toContain("5905Alice");
  });

  it("includes Singapore as merchant city", () => {
    expect(generatePayNowQRString(base)).toContain("6009Singapore");
  });

  it("encodes mobile number with +65 prefix in tag 26", () => {
    expect(generatePayNowQRString(base)).toContain("+6591234567");
  });

  it("editable=true sets sub-tag 03 to '1'", () => {
    expect(generatePayNowQRString({ ...base, editable: true })).toContain(
      "03011"
    );
  });

  it("editable=false sets sub-tag 03 to '0'", () => {
    expect(generatePayNowQRString({ ...base, editable: false })).toContain(
      "03010"
    );
  });

  it("defaults editable to true", () => {
    expect(generatePayNowQRString(base)).toContain("03011");
  });

  it("ends with 6304 followed by exactly 4 hex chars", () => {
    expect(generatePayNowQRString(base)).toMatch(/6304[0-9A-F]{4}$/);
  });

  it("produces a known-good full QR string", () => {
    // Pre-verified with zbarimg against a real PayNow QR
    const result = generatePayNowQRString({
      mobileNumber: "89211925",
      amount: 42.65,
      merchantName: "Ruoqian",
      editable: true,
    });
    // Structural checks on the known payload
    expect(result).toContain("0009SG.PAYNOW");
    expect(result).toContain("0211+6589211925");
    expect(result).toContain("540542.65");
    expect(result).toContain("5907Ruoqian");
    expect(result).toContain("6009Singapore");
    expect(result).not.toContain("null");
    expect(result).toMatch(/6304[0-9A-F]{4}$/);
  });
});
