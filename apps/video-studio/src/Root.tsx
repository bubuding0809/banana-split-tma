import "./index.css";
import { Composition } from "remotion";
import { NotificationsFeature } from "./compositions/NotificationsFeature";
import { TOTAL_FRAMES } from "./compositions/NotificationsFeature/scenes";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="NotificationsFeature"
        component={NotificationsFeature}
        durationInFrames={TOTAL_FRAMES}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ speed: 1 }}
      />
      <Composition
        id="NotificationsFeature2x"
        component={NotificationsFeature}
        durationInFrames={Math.ceil(TOTAL_FRAMES / 2)}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ speed: 2 }}
      />
    </>
  );
};
