import { useLaunchParams } from "@telegram-apps/sdk-react";

const NON_MOBILE_PLATFORMS = ["macos", "tdesktop", "weba", "web", "webk"];

/**
 * Hook that returns a boolean indicating whether the app is launched on mobile (iOS/Android).
 * Uses the Telegram launch parameters to detect the platform.
 *
 * @returns {boolean} True if the app is running on mobile platforms, false otherwise
 */
const useIsMobile = (): boolean => {
  const launchParams = useLaunchParams();

  return !NON_MOBILE_PLATFORMS.includes(launchParams.platform);
};

export default useIsMobile;
