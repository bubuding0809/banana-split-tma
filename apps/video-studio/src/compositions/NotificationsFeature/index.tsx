import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { CaptionCard } from "./CaptionCard";
import { PhoneScreen } from "./PhoneScreen";
import { NAV_TRANSITION_END, beatAt, beatIndexAt } from "./scenes";

type Props = {
  speed?: number;
};

export const NotificationsFeature: React.FC<Props> = ({ speed = 1 }) => {
  const rawFrame = useCurrentFrame();
  const frame = rawFrame * speed;
  const beat = beatAt(frame);
  const beatIndex = beatIndexAt(frame);

  const spotlight = interpolate(
    frame,
    [NAV_TRANSITION_END, NAV_TRANSITION_END + 18],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 70% 30%, #ffffff 0%, #f3f5f8 60%, #e9edf2 100%)",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: "50%",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          paddingTop: 40,
          overflow: "visible",
        }}
      >
        <PhoneScreen frame={frame} beat={beat} />
      </div>
      <div
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: "50%",
        }}
      >
        <CaptionCard frame={frame} beatIndex={beatIndex} />
      </div>
      {spotlight > 0 && (
        <div
          style={{
            position: "absolute",
            left: 180,
            top: 580,
            width: 600,
            height: 310,
            borderRadius: 28,
            pointerEvents: "none",
            zIndex: 50,
            boxShadow: `0 0 0 ${4 * spotlight}px rgba(51,144,236,${0.75 * spotlight}), 0 0 ${80 * spotlight}px ${10 * spotlight}px rgba(51,144,236,${0.55 * spotlight}), 0 0 ${200 * spotlight}px ${40 * spotlight}px rgba(51,144,236,${0.25 * spotlight})`,
          }}
        />
      )}
    </AbsoluteFill>
  );
};
