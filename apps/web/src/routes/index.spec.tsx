import { test, expect } from "@playwright/experimental-ct-react";
import { Index } from "./index";

test.use({ viewport: { width: 375, height: 812 } });

test("splash screen renders correctly", async ({ mount }) => {
  const component = await mount(<Index />);
  await expect(component).toContainText("🍌 Banana Splitz");
  await expect(component).toHaveScreenshot("splash-screen.png");
});
