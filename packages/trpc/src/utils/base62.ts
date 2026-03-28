const ALPHABET =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const BASE = BigInt(ALPHABET.length);

export function encodeBase62(num: bigint): string {
  if (num === 0n) return ALPHABET[0];
  let str = "";
  let current = num;
  while (current > 0n) {
    str = ALPHABET[Number(current % BASE)] + str;
    current = current / BASE;
  }
  return str;
}

export function decodeBase62(str: string): bigint {
  let num = 0n;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const value = BigInt(ALPHABET.indexOf(char));
    if (value === -1n) throw new Error(`Invalid base62 character: ${char}`);
    num = num * BASE + value;
  }
  return num;
}
