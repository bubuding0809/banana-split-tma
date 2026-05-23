export type RecurrenceFrequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export type Weekday = "SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT";

export type ChatType =
  | "private"
  | "group"
  | "supergroup"
  | "channel"
  | "sender";

export const CHAT_TYPES: readonly ChatType[] = [
  "private",
  "group",
  "supergroup",
  "channel",
  "sender",
];

export const WEEKDAYS: readonly Weekday[] = [
  "SUN",
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
  "SAT",
];
