import { Section } from "@telegram-apps/telegram-ui";
import type { ReactNode } from "react";

/**
 * Groups the secondary popup actions (different amount, move debt) under one
 * header, padded so the native Copy Phone / Remind / Settled bottom bar never
 * covers the last cell. `--tgui--safe_area_inset_bottom` is the variable
 * @telegram-apps/telegram-ui's own AppRoot already defines from
 * `env(safe-area-inset-bottom)` (see its own sheet/modal bottom padding); the
 * fallback keeps the padding at 24px when it is unset.
 */
export function OtherOptionsSection({ children }: { children: ReactNode }) {
  return (
    <div
      className="px-3 pt-2"
      style={{
        paddingBottom: "calc(24px + var(--tgui--safe_area_inset_bottom, 0px))",
      }}
    >
      <Section header="Other options">{children}</Section>
    </div>
  );
}

export default OtherOptionsSection;
