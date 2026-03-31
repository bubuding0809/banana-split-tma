/**
 * PayNow QR string generation.
 *
 * Implements the SGQR/EMVCo TLV format for Singapore PayNow (mobile proxy).
 * Pure TypeScript — no external dependencies, browser-compatible.
 *
 * Spec: EMVCo Merchant Presented QR Code Specification v1.1
 */

/** Builds one EMV TLV field: tag (2 chars) + length (2 digits) + value. */
export function tlv(tag: string, value: string): string {
  return tag + value.length.toString().padStart(2, "0") + value;
}

/**
 * CRC16/CCITT-FALSE — polynomial 0x1021, initial value 0xFFFF.
 * Returns a 4-char uppercase hex string.
 */
export function crc16(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export interface GeneratePayNowQRParams {
  /** 8-digit SG mobile number without country code, e.g. "91234567" */
  mobileNumber: string;
  /** Amount in SGD */
  amount: number;
  /** Payee display name, max 25 chars */
  merchantName: string;
  /** Whether the payer can edit the amount. Defaults to true. */
  editable?: boolean;
}

/** Generates a PayNow SGQR string suitable for rendering as a QR code. */
export function generatePayNowQRString({
  mobileNumber,
  amount,
  merchantName,
  editable = true,
}: GeneratePayNowQRParams): string {
  const merchantAccountInfo = [
    tlv("00", "SG.PAYNOW"),
    tlv("01", "0"),
    tlv("02", `+65${mobileNumber}`),
    tlv("03", editable ? "1" : "0"),
    tlv("04", "99991231"),
  ].join("");

  const preliminary = [
    tlv("00", "01"),
    tlv("01", "12"),
    tlv("26", merchantAccountInfo),
    tlv("52", "0000"),
    tlv("53", "702"),
    tlv("54", amount.toFixed(2)),
    tlv("58", "SG"),
    tlv("59", merchantName || "NA"),
    tlv("60", "Singapore"),
    "6304",
  ].join("");

  return preliminary + crc16(preliminary);
}
