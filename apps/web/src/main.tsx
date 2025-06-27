import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { AppRoot } from "@telegram-apps/telegram-ui";
import "./index.css";
import "@telegram-apps/telegram-ui/dist/styles.css";

// Initialize eruda (mobile debugger) in development mode
if (process.env.NODE_ENV === "development") {
  const initEruda = async () => {
    const { default: eruda } = await import("eruda");
    eruda.init();
  };
  initEruda();
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppRoot platform="ios">
      <App />
    </AppRoot>
  </StrictMode>
);
