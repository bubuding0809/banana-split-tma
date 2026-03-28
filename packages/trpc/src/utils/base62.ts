const ALPHABET =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const BASE = BigInt(ALPHABET.length);

export function encodeBase62(num: bigint): string {
  if (num < 0n) throw new Error("Cannot encode negative numbers");
  if (num === 0n) return ALPHABET[0] as string;
  let str = "";
  let current = num;
  while (current > 0n) {
    str = (ALPHABET[Number(current % BASE)] as string) + str;
    current = current / BASE;
  }
  return str;
}

export function decodeBase62(str: string): bigint {
  let num = 0n;
  for (let i = 0; i < str.length; i++) {
    const char = str[i] as string;
    const idx = ALPHABET.indexOf(char);
    if (idx === -1) throw new Error(`Invalid base62 character: ${char}`);
    num = num * BASE + BigInt(idx);
  }
  return num;
}
