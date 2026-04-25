import type { ReactNode } from "react";

// iOS Settings-style colored icon backgrounds. Solid color, white glyph.
export const ICON_COLOR = {
  blue: "#007aff",
  green: "#34c759",
  purple: "#af52de",
  orange: "#ff9500",
  red: "#ff3b30",
  gray: "#8e8e93",
  indigo: "#5856d6",
  teal: "#5ac8fa",
  pink: "#ff2d55",
} as const;

export type IconColor = keyof typeof ICON_COLOR;

interface IconSquareProps {
  color: IconColor;
  children: ReactNode;
}

export default function IconSquare({ color, children }: IconSquareProps) {
  return (
    <span
      className="flex size-7 items-center justify-center rounded-md text-white"
      style={{ background: ICON_COLOR[color] }}
    >
      {children}
    </span>
  );
}
