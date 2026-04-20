import { AppRoot, Cell, Section, Switch } from "@telegram-apps/telegram-ui";
import { Bell, BellOff, ChevronsUpDown, Phone, X } from "lucide-react";
import { interpolate } from "remotion";
import { TapRipple } from "./TapRipple";
import {
  FLIP_EXPENSE_FRAME,
  FLIP_SETTLEMENT_FRAME,
  FOOTER_GLOW_DURATION,
  FOOTER_GLOW_START,
  NAV_TRANSITION_END,
  TAP_DURATION,
  TAP_EXPENSE_START,
  TAP_SETTLEMENT_START,
  type Beat,
} from "./scenes";

const SPOTLIGHT_RAMP_FRAMES = 18;

type Props = {
  frame: number;
  beat: Beat;
};

export const FakeSettingsPage: React.FC<Props> = ({ frame, beat }) => {
  const notifyOnExpense = frame < FLIP_EXPENSE_FRAME;
  const notifyOnSettlement = frame < FLIP_SETTLEMENT_FRAME;

  const footerGlowLocal = frame - FOOTER_GLOW_START;
  const footerGlowStrength =
    beat.footerGlow &&
    footerGlowLocal >= 0 &&
    footerGlowLocal <= FOOTER_GLOW_DURATION
      ? Math.sin((footerGlowLocal / FOOTER_GLOW_DURATION) * Math.PI)
      : 0;

  // Spotlight on the Notifications section: ramps in once we land on the
  // settings page, stays until the end. Dims other sections so the eye goes
  // straight to the toggles.
  const spotlight = interpolate(
    frame,
    [NAV_TRANSITION_END, NAV_TRANSITION_END + SPOTLIGHT_RAMP_FRAMES],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const dimOpacity = 1 - spotlight * 0.7;

  return (
    <AppRoot
      appearance="dark"
      platform="ios"
      style={{
        height: "100%",
        width: "100%",
        background: "transparent",
        overflow: "hidden",
        color: "#ffffff",
      }}
    >
      <main
        style={{
          padding: "12px 12px 20px",
          position: "relative",
        }}
      >
        <div
          style={{
            opacity: dimOpacity,
            filter: `blur(${spotlight * 1.2}px)`,
            transition: "opacity 120ms linear",
          }}
        >
          <Section header="Base Currency">
            <Cell
              before={
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    overflow: "hidden",
                    background: "#ffffff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    fontSize: 22,
                  }}
                >
                  🇸🇬
                </div>
              }
              subtitle="SGD"
              after={<ChevronsUpDown size={20} color="rgba(255,255,255,0.5)" />}
            >
              Singapore Dollar
            </Cell>
          </Section>

          <Section header="Personal Information">
            <Cell
              before={<Phone size={20} color="#ffffff" />}
              after={<span style={{ color: "#ffffff" }}>+1 555 0134</span>}
            >
              Phone Number
            </Cell>
            <Cell before={<X size={20} color="#3390ec" />}>
              <span style={{ color: "#3390ec" }}>Remove Phone Number</span>
            </Cell>
          </Section>
        </div>

        <div
          data-section="notifications"
          style={{
            position: "relative",
          }}
        >
          <Section
            header="Notifications"
            footer={
              <span
                style={{
                  color:
                    footerGlowStrength > 0
                      ? `rgba(45, 136, 255, ${0.7 + footerGlowStrength * 0.3})`
                      : undefined,
                  textShadow:
                    footerGlowStrength > 0
                      ? `0 0 ${8 + footerGlowStrength * 12}px rgba(45, 136, 255, ${footerGlowStrength * 0.6})`
                      : undefined,
                }}
              >
                Choose which events should notify this group. Reminders you send
                manually are unaffected.
              </span>
            }
          >
            <Cell
              before={<Bell size={20} color="#ffffff" />}
              after={<Switch checked={notifyOnExpense} readOnly />}
            >
              Expense added
            </Cell>
            <Cell
              before={<Bell size={20} color="#ffffff" />}
              after={<Switch checked={notifyOnSettlement} readOnly />}
            >
              Settlement recorded
            </Cell>
          </Section>
        </div>

        <div
          style={{
            opacity: dimOpacity,
            filter: `blur(${spotlight * 1.2}px)`,
            transition: "opacity 120ms linear",
          }}
        >
          <Section header="Notifications">
            <Cell
              before={<BellOff size={20} color="rgba(255,255,255,0.4)" />}
              after={<Switch checked readOnly />}
            >
              <span style={{ color: "rgba(255,255,255,0.6)" }}>
                Recurring Reminders
              </span>
            </Cell>
          </Section>
        </div>

        <TapRipple
          frame={frame}
          start={TAP_EXPENSE_START}
          duration={TAP_DURATION}
          x={430}
          y={620}
        />
        <TapRipple
          frame={frame}
          start={TAP_SETTLEMENT_START}
          duration={TAP_DURATION}
          x={430}
          y={690}
        />
      </main>
    </AppRoot>
  );
};
