import { defineConfig, devices } from "@playwright/experimental-ct-react";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  testDir: "./src",
  testMatch: /.*\.spec\.tsx?$/,
  snapshotDir: "./__snapshots__",
  timeout: 10 * 1000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    trace: "on-first-retry",
    ctPort: 3100,
    ctViteConfig: {
      resolve: {
        // Prioritise ESM ("module") over CJS ("main") so that packages like
        // @telegram-apps/telegram-ui that ship separate CJS and ESM bundles
        // resolve to the ESM build inside the CT Vite sandbox.
        mainFields: ["module", "jsnext:main", "jsnext", "main"],
        alias: {
          "@": path.resolve(__dirname, "./src"),
          "@components": path.resolve(__dirname, "./src/components"),
          "@utils": path.resolve(__dirname, "./src/utils"),
          "@hooks": path.resolve(__dirname, "./src/hooks"),
        },
      },
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
