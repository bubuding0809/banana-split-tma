/** Formats a TLV (Tag-Length-Value) field for EMV QR codes. */
function tlv(id: string, value: string): string {
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

/** CRC16-CCITT (polynomial 0x1021, initial 0xFFFF) used by SGQR/PayNow. */
function crc16(data: string): string {
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

/**
 * Returns true if the phone number is a valid Singapore mobile number
 * in the format Telegram stores it — international digits without '+',
 * e.g. "6591234567". SG mobiles start with 8 or 9 after the 65 country code.
 */
export function isValidSgMobile(phoneNumber: string): boolean {
  // Strip whitespace in case of formatting like "+65 9123 4567"
  const cleaned = phoneNumber.replace(/\s+/g, "");
  return /^\+?65[89]\d{7}$/.test(cleaned);
}

/**
 * Generates a PayNow EMV QR string (SGQR standard).
 *
 * @param phoneNumber  - Creditor's SG mobile as stored by Telegram, e.g. "6591234567".
 *                       Normalised to E.164 format (+6591234567) internally.
 * @param amount       - Amount in SGD. Pass 0 to let the payer enter the amount.
 * @param merchantName - Creditor's name shown in the payer's bank app (e.g. first name).
 * @param reference    - Optional payment reference shown in payer's bank app.
 */
export function generatePayNowString(
  phoneNumber: string,
  amount: number,
  merchantName: string,
  reference?: string
): string {
  // Strip any whitespace
  const cleaned = phoneNumber.replace(/\s+/g, "");
  // PayNow proxy must be E.164 format; Telegram omits the '+' so we add it.
  const e164 = cleaned.startsWith("+") ? cleaned : `+${cleaned}`;

  const merchantAccountInfo = [
    tlv("00", "SG.PAYNOW"), // GUID
    tlv("01", "0"), // Proxy type: 0 = mobile number
    tlv("02", e164), // Proxy value in E.164 format
    tlv("03", "1"), // Amount editable: 1 = payer can change
  ].join("");

  const parts: string[] = [
    tlv("00", "01"), // Payload Format Indicator
    tlv("01", amount > 0 ? "11" : "12"), // 11 = dynamic (amount pre-filled), 12 = static
    tlv("26", merchantAccountInfo), // PayNow Merchant Account Info
    tlv("52", "0000"), // Merchant Category Code (generic)
    tlv("53", "702"), // Transaction Currency: 702 = SGD
  ];

  if (amount > 0) {
    parts.push(tlv("54", amount.toFixed(2))); // Transaction Amount
  }

  parts.push(
    tlv("58", "SG"), // Country Code
    tlv("59", merchantName.slice(0, 25)), // Merchant Name (creditor's name, max 25 chars per EMV spec)
    tlv("60", "SINGAPORE") // Merchant City
  );

  if (reference) {
    parts.push(tlv("62", tlv("01", reference))); // Additional Data: bill ref
  }

  parts.push("6304"); // CRC tag + length placeholder

  const payload = parts.join("");
  return payload + crc16(payload);
}
