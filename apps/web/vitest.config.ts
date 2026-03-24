import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
      "@components": new URL("./src/components", import.meta.url).pathname,
      "@utils": new URL("./src/utils", import.meta.url).pathname,
      "@hooks": new URL("./src/hooks", import.meta.url).pathname,
    },
  },
});
