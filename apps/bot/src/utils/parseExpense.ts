export interface ParsedExpense {
  amount: number;
  description: string;
  currency?: string;
  date?: Date;
}

const AMOUNT_RE = /^\$?(\d+(?:\.\d{1,2})?)$/;
const CURRENCY_RE = /^[A-Z]{3}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const SAFE_SINGLE_DATES = new Set([
  "yesterday",
  "today",
  "tomorrow",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
]);

const DAY_MAP: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

function isValidDate(date: Date) {
  return !isNaN(date.getTime());
}

function parseDatePhrase(phrase: string): Date | null {
  phrase = phrase.toLowerCase().trim();
  const nowLocal = new Date();
  const now = new Date(
    Date.UTC(nowLocal.getFullYear(), nowLocal.getMonth(), nowLocal.getDate())
  );

  if (DATE_RE.test(phrase)) {
    const parts = phrase.split("-").map(Number);
    const y = parts[0]!;
    const m = parts[1]!;
    const d = parts[2]!;
    const date = new Date(Date.UTC(y, m - 1, d));
    if (isValidDate(date)) return date;
    return null;
  }

  const daysAgoMatch = phrase.match(/^(\d+)\s+days?\s+ago$/);
  if (daysAgoMatch && daysAgoMatch[1]) {
    return new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - parseInt(daysAgoMatch[1], 10)
      )
    );
  }

  if (phrase === "today") return now;
  if (phrase === "yesterday")
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1)
    );
  if (phrase === "tomorrow")
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
    );

  const words = phrase.split(/\s+/);

  if (words.length === 1 && words[0] && DAY_MAP[words[0]] !== undefined) {
    const targetDay = DAY_MAP[words[0]]!;
    let d = now;
    // Find nearest past day
    while (d.getUTCDay() !== targetDay) {
      d = new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - 1)
      );
    }
    // If it's today, subtract 7 days
    if (d.getTime() === now.getTime()) {
      d = new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - 7)
      );
    }
    return d;
  }

  if (
    words.length === 2 &&
    words[0] &&
    words[1] &&
    ["last", "next", "this"].includes(words[0]) &&
    DAY_MAP[words[1]] !== undefined
  ) {
    const modifier = words[0];
    const targetDay = DAY_MAP[words[1]]!;
    let d = now;

    if (modifier === "last") {
      d = new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - 1)
      );
      while (d.getUTCDay() !== targetDay) {
        d = new Date(
          Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - 1)
        );
      }
    } else if (modifier === "next") {
      d = new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)
      );
      while (d.getUTCDay() !== targetDay) {
        d = new Date(
          Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)
        );
      }
    } else if (modifier === "this") {
      // Current week logic: just find the next/current occurrence
      while (d.getUTCDay() !== targetDay) {
        d = new Date(
          Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)
        );
      }
    }
    return d;
  }

  return null;
}

export function parseExpense(text: string): ParsedExpense | null {
  text = text.trim();
  if (!text) return null;

  let amount: number | null = null;
  let currency: string | null = null;
  let date: Date | null = null;
  const descParts: string[] = [];

  let remainingText = text;

  // 1. Delimiter-Based Parsing
  if (remainingText.includes(",")) {
    const lastCommaIndex = remainingText.lastIndexOf(",");
    const leftSide = remainingText.slice(0, lastCommaIndex).trim();
    const rightSide = remainingText.slice(lastCommaIndex + 1).trim();

    const parsedDate = parseDatePhrase(rightSide);
    if (parsedDate) {
      date = parsedDate;
      remainingText = leftSide;
    }
  }

  // 2. Tokenize the remaining text
  const tokens = remainingText.split(/\s+/);
  let skipNext = false;

  for (let i = 0; i < tokens.length; i++) {
    if (skipNext) {
      skipNext = false;
      continue;
    }

    const token = tokens[i];
    if (!token) continue;
    const tokenLower = token.toLowerCase();

    // Try amount
    if (amount === null) {
      const clean = token.replace(/^\$/, "");
      const match = clean.match(/^(\d+(?:\.\d{1,2})?)$/);
      if (match && match[1] && (token === clean || token === `$${clean}`)) {
        const val = parseFloat(match[1]);
        if (val > 0) {
          amount = val;
          continue;
        }
      }
    }

    // Try currency
    if (currency === null && CURRENCY_RE.test(token)) {
      currency = token;
      continue;
    }

    // Try date
    if (date === null) {
      if (i < tokens.length - 1) {
        const nextToken = tokens[i + 1];
        if (nextToken) {
          const nextTokenLower = nextToken.toLowerCase();
          if (
            ["last", "next", "this"].includes(tokenLower) &&
            SAFE_SINGLE_DATES.has(nextTokenLower)
          ) {
            const parsedDate = parseDatePhrase(
              `${tokenLower} ${nextTokenLower}`
            );
            if (parsedDate) {
              date = parsedDate;
              skipNext = true;
              continue;
            }
          }
        }
      }

      if (DATE_RE.test(token) || SAFE_SINGLE_DATES.has(tokenLower)) {
        const parsedDate = parseDatePhrase(token);
        if (parsedDate) {
          date = parsedDate;
          continue;
        }
      }
    }

    // Rest is description
    descParts.push(token);
  }

  if (amount === null) return null;

  const description = descParts.join(" ").trim();
  if (!description) return null;

  return {
    amount,
    description,
    currency: currency || undefined,
    date: date || undefined,
  };
}
