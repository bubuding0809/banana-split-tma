/**
 * PayNow QR string generator for Singapore mobile number payments.
 *
 * Based on the proven working reference implementation:
 * https://github.com/jtaych/PayNow-QR-Javascript
 *
 * Follows EMVCo Merchant-Presented QR Specification v1.1
 * and SGQR (Singapore Quick Response) standard.
 */

/** Formats a TLV (Tag-Length-Value) field for EMV QR codes. */
function tlv(id: string, value: string): string {
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

/**
 * CRC16-CCITT-FALSE (polynomial 0x1021, initial 0xFFFF).
 * Matches the `crc-full` library's CRC16_CCITT_FALSE preset.
 */
function crc16(data: string): string {
  const crcTable = [
    0x0000, 0x1021, 0x2042, 0x3063, 0x4084, 0x50a5, 0x60c6, 0x70e7, 0x8108,
    0x9129, 0xa14a, 0xb16b, 0xc18c, 0xd1ad, 0xe1ce, 0xf1ef, 0x1231, 0x0210,
    0x3273, 0x2252, 0x52b5, 0x4294, 0x72f7, 0x62d6, 0x9339, 0x8318, 0xb37b,
    0xa35a, 0xd3bd, 0xc39c, 0xf3ff, 0xe3de, 0x2462, 0x3443, 0x0420, 0x1401,
    0x64e6, 0x74c7, 0x44a4, 0x5485, 0xa56a, 0xb54b, 0x8528, 0x9509, 0xe5ee,
    0xf5cf, 0xc5ac, 0xd58d, 0x3653, 0x2672, 0x1611, 0x0630, 0x76d7, 0x66f6,
    0x5695, 0x46b4, 0xb75b, 0xa77a, 0x9719, 0x8738, 0xf7df, 0xe7fe, 0xd79d,
    0xc7bc, 0x48c4, 0x58e5, 0x6886, 0x78a7, 0x0840, 0x1861, 0x2802, 0x3823,
    0xc9cc, 0xd9ed, 0xe98e, 0xf9af, 0x8948, 0x9969, 0xa90a, 0xb92b, 0x5af5,
    0x4ad4, 0x7ab7, 0x6a96, 0x1a71, 0x0a50, 0x3a33, 0x2a12, 0xdbfd, 0xcbdc,
    0xfbbf, 0xeb9e, 0x9b79, 0x8b58, 0xbb3b, 0xab1a, 0x6ca6, 0x7c87, 0x4ce4,
    0x5cc5, 0x2c22, 0x3c03, 0x0c60, 0x1c41, 0xedae, 0xfd8f, 0xcdec, 0xddcd,
    0xad2a, 0xbd0b, 0x8d68, 0x9d49, 0x7e97, 0x6eb6, 0x5ed5, 0x4ef4, 0x3e13,
    0x2e32, 0x1e51, 0x0e70, 0xff9f, 0xefbe, 0xdfdd, 0xcffc, 0xbf1b, 0xaf3a,
    0x9f59, 0x8f78, 0x9188, 0x81a9, 0xb1ca, 0xa1eb, 0xd10c, 0xc12d, 0xf14e,
    0xe16f, 0x1080, 0x00a1, 0x30c2, 0x20e3, 0x5004, 0x4025, 0x7046, 0x6067,
    0x83b9, 0x9398, 0xa3fb, 0xb3da, 0xc33d, 0xd31c, 0xe37f, 0xf35e, 0x02b1,
    0x1290, 0x22f3, 0x32d2, 0x4235, 0x5214, 0x6277, 0x7256, 0xb5ea, 0xa5cb,
    0x95a8, 0x8589, 0xf56e, 0xe54f, 0xd52c, 0xc50d, 0x34e2, 0x24c3, 0x14a0,
    0x0481, 0x7466, 0x6447, 0x5424, 0x4405, 0xa7db, 0xb7fa, 0x8799, 0x97b8,
    0xe75f, 0xf77e, 0xc71d, 0xd73c, 0x26d3, 0x36f2, 0x0691, 0x16b0, 0x6657,
    0x7676, 0x4615, 0x5634, 0xd94c, 0xc96d, 0xf90e, 0xe92f, 0x99c8, 0x89e9,
    0xb98a, 0xa9ab, 0x5844, 0x4865, 0x7806, 0x6827, 0x18c0, 0x08e1, 0x3882,
    0x28a3, 0xcb7d, 0xdb5c, 0xeb3f, 0xfb1e, 0x8bf9, 0x9bd8, 0xabbb, 0xbb9a,
    0x4a75, 0x5a54, 0x6a37, 0x7a16, 0x0af1, 0x1ad0, 0x2ab3, 0x3a92, 0xfd2e,
    0xed0f, 0xdd6c, 0xcd4d, 0xbdaa, 0xad8b, 0x9de8, 0x8dc9, 0x7c26, 0x6c07,
    0x5c64, 0x4c45, 0x3ca2, 0x2c83, 0x1ce0, 0x0cc1, 0xef1f, 0xff3e, 0xcf5d,
    0xdf7c, 0xaf9b, 0xbfba, 0x8fd9, 0x9ff8, 0x6e17, 0x7e36, 0x4e55, 0x5e74,
    0x2e93, 0x3eb2, 0x0ed1, 0x1ef0,
  ];

  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    const c = data.charCodeAt(i);
    const j = (c ^ (crc >> 8)) & 0xff;
    crc = crcTable[j]! ^ (crc << 8);
  }
  return ((crc ^ 0) & 0xffff).toString(16).toUpperCase().padStart(4, "0");
}

/**
 * Returns true if the phone number is a valid Singapore mobile number
 * in the format Telegram stores it — international digits without '+',
 * e.g. "6591234567". SG mobiles start with 8 or 9 after the 65 country code.
 */
export function isValidSgMobile(phoneNumber: string): boolean {
  const cleaned = phoneNumber.replace(/\s+/g, "");
  return /^\+?65[89]\d{7}$/.test(cleaned);
}

/**
 * Generates a PayNow EMV QR string (SGQR standard) for mobile number payments.
 *
 * Follows the structure from the jtaych/PayNow-QR-Javascript reference
 * which has been verified to work with Singapore banking apps.
 *
 * @param phoneNumber  - Creditor's SG mobile, e.g. "6591234567" or "+6591234567".
 * @param amount       - Amount in SGD. Pass 0 to let the payer enter the amount.
 * @param merchantName - Creditor's name shown in payer's bank app.
 * @param editable     - Whether the payer can edit the amount. Defaults to true.
 */
export function generatePayNowString(
  phoneNumber: string,
  amount: number,
  merchantName: string,
  editable = true
): string {
  // Normalize to E.164 format
  const cleaned = phoneNumber.replace(/\s+/g, "");
  const e164 = cleaned.startsWith("+") ? cleaned : `+${cleaned}`;

  // Build Merchant Account Info (tag 26) sub-fields
  const merchantAccountInfo = [
    tlv("00", "SG.PAYNOW"), // Globally Unique Identifier
    tlv("01", "0"), // Proxy type: 0 = mobile number
    tlv("02", e164), // Proxy value
    tlv("03", editable ? "1" : "0"), // Amount editable flag
    tlv("04", "99991231"), // Expiry date: effectively never
  ].join("");

  // Build top-level EMV QR payload
  const amountStr = String(amount);
  const name = merchantName.slice(0, 25) || "NA";

  const parts: string[] = [
    tlv("00", "01"), // Payload Format Indicator
    tlv("01", "11"), // Point of Initiation: 11 = dynamic
    tlv("26", merchantAccountInfo), // Merchant Account Info
    tlv("52", "0000"), // Merchant Category Code (not used)
    tlv("53", "702"), // Transaction Currency: SGD
    tlv("54", amountStr), // Transaction Amount (always included)
    tlv("58", "SG"), // Country Code
    tlv("59", name), // Merchant Name
    tlv("60", "Singapore"), // Merchant City
    "6304", // CRC tag + length (checksum appended below)
  ];

  const payload = parts.join("");
  return payload + crc16(payload);
}
