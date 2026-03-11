import { beforeMount } from "@playwright/experimental-ct-react/hooks";
import { AppRoot } from "@telegram-apps/telegram-ui";
import React from "react";
import "../src/index.css";
import "@telegram-apps/telegram-ui/dist/styles.css";

beforeMount(async ({ App }) => {
  return (
    <AppRoot platform="ios">
      <App />
    </AppRoot>
  );
});
