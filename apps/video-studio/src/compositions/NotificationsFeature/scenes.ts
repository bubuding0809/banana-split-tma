export const FPS = 30;

export type Page = "group" | "settings";

export type Beat = {
  start: number;
  end: number;
  title: string;
  body: string;
  page: Page;
  notifyOnExpense: boolean;
  notifyOnSettlement: boolean;
  tap: "groupSettings" | "expense" | "settlement" | null;
  footerGlow: boolean;
};

export const BEATS: Beat[] = [
  {
    start: 0,
    end: 75,
    title: "Open group settings",
    body: "Tap the group header in any Telegram group chat.",
    page: "group",
    notifyOnExpense: true,
    notifyOnSettlement: true,
    tap: "groupSettings",
    footerGlow: false,
  },
  {
    start: 75,
    end: 165,
    title: "Per-event notifications",
    body: "Pick which group events send a Telegram alert.",
    page: "settings",
    notifyOnExpense: true,
    notifyOnSettlement: true,
    tap: null,
    footerGlow: false,
  },
  {
    start: 165,
    end: 255,
    title: "Mute expense alerts",
    body: "Keep expenses quiet without losing settlement updates.",
    page: "settings",
    notifyOnExpense: false,
    notifyOnSettlement: true,
    tap: "expense",
    footerGlow: false,
  },
  {
    start: 255,
    end: 345,
    title: "Or settlement alerts",
    body: "Every event type has its own toggle.",
    page: "settings",
    notifyOnExpense: false,
    notifyOnSettlement: false,
    tap: "settlement",
    footerGlow: false,
  },
  {
    start: 345,
    end: 435,
    title: "Reminders still go through",
    body: "Manual reminders are never gated by these switches.",
    page: "settings",
    notifyOnExpense: false,
    notifyOnSettlement: false,
    tap: null,
    footerGlow: true,
  },
];

export const TOTAL_FRAMES = BEATS[BEATS.length - 1].end;

// Navigation transition: group → settings slides between these frames.
// Duration 12 frames ≈ 400ms at 30fps, driven by the iOS-drawer bezier.
export const NAV_TRANSITION_START = 60;
export const NAV_TRANSITION_END = 72;

// Exact frames at which the real switches flip (mid-ripple).
export const FLIP_EXPENSE_FRAME = 195;
export const FLIP_SETTLEMENT_FRAME = 285;

// Tap ripple window for each interaction.
export const TAP_GROUP_SETTINGS_START = 40;
export const TAP_EXPENSE_START = 180;
export const TAP_SETTLEMENT_START = 270;
export const TAP_DURATION = 25;

export const FOOTER_GLOW_START = 350;
export const FOOTER_GLOW_DURATION = 40;

export const beatAt = (frame: number): Beat => {
  for (const beat of BEATS) {
    if (frame < beat.end) return beat;
  }
  return BEATS[BEATS.length - 1];
};

export const beatIndexAt = (frame: number): number => {
  for (let i = 0; i < BEATS.length; i++) {
    if (frame < BEATS[i].end) return i;
  }
  return BEATS.length - 1;
};
