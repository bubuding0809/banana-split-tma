/**
 * UI constants for consistent behavior across the application
 */

export const ANIMATION_DURATIONS = {
  /** Duration for transaction highlight animation (in milliseconds) */
  HIGHLIGHT: 1000,
  /** Duration for badge pop animation (in milliseconds) */
  BADGE_POP: 200,
  /** Duration for badge shake animation (in milliseconds) */
  BADGE_SHAKE: 250,
} as const;

export const SCROLL_MARGINS = {
  /** Top margin when scrolling to transaction elements */
  TOP: "25vh",
} as const;

export const FALLBACK_COLORS = {
  /** Fallback highlight color when theme color is unavailable */
  HIGHLIGHT: "#22c55e",
} as const;

export const CSS_CLASSES = {
  /** Animation classes for transaction highlighting */
  HIGHLIGHT: ["animate-pulse", "outline"],
  /** Animation classes for badge animations */
  BADGE_POP: "animate-badge-pop",
  BADGE_SHAKE: "animate-badge-shake",
} as const;
