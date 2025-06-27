import { Outlet, createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import {
  backButton,
  initData,
  init as initTma,
  mainButton,
  retrieveLaunchParams,
  secondaryButton,
  themeParams,
  useSignal,
  viewport,
} from "@telegram-apps/sdk-react";
import { Subheadline } from "@telegram-apps/telegram-ui";
import { useEffect } from "react";
import { cn } from "@/utils/cn";
import { z } from "zod";

export const Route = createFileRoute("/_tma")({
  component: LayoutComponent,
  validateSearch: zodValidator(
    z.object({
      title: z.string().catch("🍌 Splitz"),
    })
  ),
});

// Initialize telegram mini app sdk
try {
  initTma();
} catch (err) {
  console.error(err);
}

function LayoutComponent() {
  const { title } = Route.useSearch();
  const isFullScreen = useSignal(viewport.isFullscreen);

  // Mount Telegram Mini App components
  useEffect(() => {
    // Ensure initData is properly restored
    initData.restore();

    // Mount required tma components
    mainButton.mount();
    secondaryButton.mount();
    viewport.mount();
    themeParams.mount();
    backButton.mount();

    return () => {
      mainButton.unmount();
      secondaryButton.unmount();
      viewport.unmount();
      themeParams.unmount();
      backButton.unmount();
    };
  }, []);

  // Add css classes to enable sticky mode (Prevent downwards scroll closure)
  useEffect(() => {
    const enableSticky = () => {
      const lp = retrieveLaunchParams();

      // Some versions of Telegram don't need the classes above.
      if (["macos", "tdesktop", "weba", "web", "webk"].includes(lp.platform)) {
        return;
      }

      document.body.classList.add("mobile-body");
      document.getElementById("wrap")?.classList.add("mobile-wrap");
      document.getElementById("content")?.classList.add("mobile-content");
    };

    // Enable sticky mode
    enableSticky();
  }, []);

  return (
    <div id="wrap">
      <div id="content">
        <div className={cn(isFullScreen && "h-24")}>
          <div className="flex h-full items-center justify-center pt-12">
            <Subheadline weight="1">{title}</Subheadline>
          </div>
        </div>
        <Outlet />
        <footer className="flex items-center justify-center pb-8 pt-4 text-sm text-gray-500">
          <p>
            &copy; {new Date().getFullYear()} Banana Splitz. All rights
            reserved.
          </p>
        </footer>
      </div>
    </div>
  );
}
