/**
 * PayNow validation utilities.
 *
 * QR string generation has been moved to the server-side tRPC layer
 * (payment.generatePayNowQR) to leverage the `paynow-generator` npm
 * package which requires Node.js APIs (Buffer, crc-full).
 */

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
 * Extracts the 8-digit mobile number from a full SG phone number.
 * e.g. "6591234567" → "91234567", "+6591234567" → "91234567"
 */
export function extractMobileNumber(phoneNumber: string): string {
  const cleaned = phoneNumber.replace(/\s+/g, "");
  const withoutPlus = cleaned.startsWith("+") ? cleaned.slice(1) : cleaned;
  // Remove the "65" country code prefix
  return withoutPlus.startsWith("65") ? withoutPlus.slice(2) : withoutPlus;
}
