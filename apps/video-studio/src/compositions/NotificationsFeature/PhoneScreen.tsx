import { IPhoneMockup } from "react-device-mockup";
import { Easing, interpolate, spring, useVideoConfig } from "remotion";
import { Settings, Users } from "lucide-react";
import { FakeGroupPage } from "./FakeGroupPage";
import { FakeSettingsPage } from "./FakeSettingsPage";
import { TelegramTopBar } from "./TelegramTopBar";
import { NAV_TRANSITION_END, NAV_TRANSITION_START, type Beat } from "./scenes";

// iOS drawer curve (Ionic Framework) — matches how iOS push-navigation feels.
const IOS_DRAWER_EASING = Easing.bezier(0.32, 0.72, 0, 1);

type Props = {
  frame: number;
  beat: Beat;
};

const SCREEN_WIDTH = 390;
const PHONE_SCALE = 1.5;

export const PhoneScreen: React.FC<Props> = ({ frame, beat }) => {
  const { fps } = useVideoConfig();
  const liftProgress = spring({
    frame,
    fps,
    config: { damping: 20, stiffness: 100, mass: 1 },
    durationInFrames: 30,
  });

  const navProgress = interpolate(
    frame,
    [NAV_TRANSITION_START, NAV_TRANSITION_END],
    [0, 1],
    {
      easing: IOS_DRAWER_EASING,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  const showBoth = frame >= NAV_TRANSITION_START && frame <= NAV_TRANSITION_END;
  const isGroupPage = frame < NAV_TRANSITION_START;

  // Outgoing group page: push-back (parallax), dim, slight scale-down.
  const groupX = navProgress * -30;
  const groupOpacity = 1 - navProgress * 0.55;
  const groupScale = 1 - navProgress * 0.04;

  // Incoming settings page: slide in from right, no opacity shift.
  const settingsX = (1 - navProgress) * 100;

  return (
    <div
      style={{
        transform: `translateY(${(1 - liftProgress) * 20}px) scale(${PHONE_SCALE * (0.98 + liftProgress * 0.02)})`,
        transformOrigin: "top center",
        filter: "drop-shadow(0 40px 90px rgba(15, 23, 42, 0.22))",
      }}
    >
      <IPhoneMockup
        screenWidth={SCREEN_WIDTH}
        screenType="island"
        frameColor="#1a1a1c"
        hideStatusBar
      >
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            overflow: "hidden",
            background: "#15171c",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <StatusBar />
          <div style={{ position: "relative" }}>
            <TelegramTopBar
              variant={navProgress >= 0.5 ? "back" : "close"}
              title={navProgress >= 0.5 ? "Group Settings" : "Group"}
              titleIcon={
                navProgress >= 0.5 ? (
                  <Settings size={17} color="#9ca3af" />
                ) : (
                  <Users size={17} color="#9ca3af" />
                )
              }
            />
          </div>
          <div
            style={{
              position: "relative",
              flex: 1,
              overflow: "hidden",
            }}
          >
            {(isGroupPage || showBoth) && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  transform: `translateX(${groupX}%) scale(${groupScale})`,
                  transformOrigin: "center center",
                  opacity: groupOpacity,
                  overflow: "hidden",
                }}
              >
                <FakeGroupPage frame={frame} />
              </div>
            )}
            {!isGroupPage && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  transform: `translateX(${settingsX}%)`,
                  boxShadow:
                    navProgress < 1
                      ? "-12px 0 32px rgba(0, 0, 0, 0.28)"
                      : "none",
                  overflow: "hidden",
                }}
              >
                <FakeSettingsPage frame={frame} beat={beat} />
              </div>
            )}
          </div>
        </div>
      </IPhoneMockup>
    </div>
  );
};

const StatusBar: React.FC = () => {
  return (
    <div
      style={{
        height: 48,
        padding: "0 28px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        fontSize: 15,
        fontWeight: 600,
        color: "#ffffff",
        background: "transparent",
        flexShrink: 0,
        position: "relative",
        zIndex: 3,
      }}
    >
      <span>3:09</span>
      <div style={{ width: 120 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <SignalIcon />
        <WifiIcon />
        <BatteryIcon />
      </div>
    </div>
  );
};

const SignalIcon: React.FC = () => (
  <svg width="18" height="12" viewBox="0 0 18 12">
    <rect x="0" y="9" width="3" height="3" rx="0.5" fill="#ffffff" />
    <rect x="5" y="6" width="3" height="6" rx="0.5" fill="#ffffff" />
    <rect x="10" y="3" width="3" height="9" rx="0.5" fill="#ffffff" />
    <rect x="15" y="0" width="3" height="12" rx="0.5" fill="#ffffff" />
  </svg>
);

const WifiIcon: React.FC = () => (
  <svg width="16" height="12" viewBox="0 0 16 12">
    <path d="M8 10.5 L6 8.5 A3 3 0 0 1 10 8.5 Z" fill="#ffffff" />
    <path
      d="M8 6 C 5.5 6 3 7 1.5 8.5 L3 10 A6 6 0 0 1 13 10 L14.5 8.5 C 13 7 10.5 6 8 6 Z"
      fill="#ffffff"
      opacity="0.7"
    />
    <path
      d="M8 2 C 4 2 0.5 3.5 -1 5 L0.5 6.5 C 2.5 4.5 5 3.5 8 3.5 C 11 3.5 13.5 4.5 15.5 6.5 L17 5 C 15.5 3.5 12 2 8 2 Z"
      fill="#ffffff"
      opacity="0.4"
    />
  </svg>
);

const BatteryIcon: React.FC = () => (
  <svg width="28" height="13" viewBox="0 0 28 13">
    <rect
      x="0.5"
      y="0.5"
      width="24"
      height="12"
      rx="3"
      fill="none"
      stroke="#ffffff"
      strokeWidth="1"
      opacity="0.4"
    />
    <rect
      x="26"
      y="4"
      width="2"
      height="5"
      rx="1"
      fill="#ffffff"
      opacity="0.4"
    />
    <rect x="2" y="2" width="20" height="9" rx="1.5" fill="#ffffff" />
  </svg>
);
