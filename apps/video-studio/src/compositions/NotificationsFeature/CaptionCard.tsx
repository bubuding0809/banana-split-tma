import { interpolate, spring, useVideoConfig } from "remotion";
import { BEATS } from "./scenes";

const FADE_FRAMES = 15;

type Props = {
  frame: number;
  beatIndex: number;
};

export const CaptionCard: React.FC<Props> = ({ frame, beatIndex }) => {
  const { fps } = useVideoConfig();
  const beat = BEATS[beatIndex];
  const framesIntoBeat = frame - beat.start;

  const enterProgress = spring({
    frame: framesIntoBeat,
    fps,
    config: { damping: 22, stiffness: 140, mass: 0.8 },
    durationInFrames: FADE_FRAMES,
  });

  const enterY = interpolate(enterProgress, [0, 1], [14, 0]);

  const framesToBeatEnd = beat.end - frame;
  const exitOpacity =
    framesToBeatEnd <= FADE_FRAMES && beatIndex < BEATS.length - 1
      ? interpolate(framesToBeatEnd, [0, FADE_FRAMES], [0, 1])
      : 1;

  const opacity = enterProgress * exitOpacity;

  // Persistent banner: springs in on frame 0 only, doesn't re-animate per beat.
  const bannerEnter = spring({
    frame,
    fps,
    config: { damping: 22, stiffness: 140, mass: 0.8 },
    durationInFrames: 20,
  });
  const bannerY = interpolate(bannerEnter, [0, 1], [12, 0]);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        padding: "96px 96px 96px 24px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 24,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignSelf: "flex-start",
          alignItems: "center",
          gap: 20,
          padding: "16px 28px",
          background: "#0f172a",
          borderRadius: 999,
          fontSize: 44,
          fontWeight: 800,
          letterSpacing: "-0.01em",
          color: "#ffffff",
          boxShadow: "0 12px 30px rgba(15, 23, 42, 0.18)",
          opacity: bannerEnter,
          transform: `translateY(${bannerY}px)`,
          marginBottom: 16,
        }}
      >
        <span style={{ fontSize: 52 }}>🚀</span>
        Per-event notifications
      </div>
      <div
        style={{
          fontSize: 132,
          lineHeight: 1.02,
          fontWeight: 700,
          color: "#0f172a",
          letterSpacing: "-0.02em",
          opacity,
          transform: `translateY(${enterY}px)`,
        }}
      >
        {beat.title}
      </div>
      <div
        style={{
          fontSize: 48,
          lineHeight: 1.35,
          color: "#475569",
          maxWidth: 780,
          opacity,
          transform: `translateY(${enterY}px)`,
        }}
      >
        {beat.body}
      </div>

      <div
        style={{
          marginTop: 40,
          display: "flex",
          gap: 14,
          opacity: enterProgress,
        }}
      >
        {BEATS.map((_, i) => (
          <div
            key={i}
            style={{
              width: i === beatIndex ? 56 : 20,
              height: 9,
              borderRadius: 5,
              transition: "all 120ms ease",
              background: i === beatIndex ? "#0f172a" : "#cbd5e1",
            }}
          />
        ))}
      </div>
    </div>
  );
};
