import { interpolate } from "remotion";

type Props = {
  frame: number;
  start: number;
  duration: number;
  x: number;
  y: number;
};

export const TapRipple: React.FC<Props> = ({
  frame,
  start,
  duration,
  x,
  y,
}) => {
  const localFrame = frame - start;
  if (localFrame < 0 || localFrame > duration) return null;

  const progress = localFrame / duration;
  const scale = interpolate(progress, [0, 1], [0.2, 1.6]);
  const opacity = interpolate(progress, [0, 0.15, 1], [0, 0.55, 0]);

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: 120,
        height: 120,
        marginLeft: -60,
        marginTop: -60,
        borderRadius: "50%",
        background:
          "radial-gradient(circle, rgba(45, 136, 255, 0.5) 0%, rgba(45, 136, 255, 0.1) 60%, rgba(45, 136, 255, 0) 100%)",
        transform: `scale(${scale})`,
        opacity,
        pointerEvents: "none",
      }}
    />
  );
};
