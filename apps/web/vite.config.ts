import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { ValidateEnv } from "@julr/vite-plugin-validate-env";
import { z } from "zod";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "./");
  const allowedHosts = env.VITE_ALLOWED_HOSTS
    ? env.VITE_ALLOWED_HOSTS.split(",")
    : [];

  return {
    plugins: [
      ValidateEnv({
        validator: "standard",
        schema: {
          VITE_TRPC_URL: z.string().url("Must be a valid URL"),
          VITE_API_KEY: z.string().optional(),
          VITE_ALLOWED_HOSTS: z.string().optional(),
          VITE_TELEGRAM_BOT_DEEP_LINK: z
            .string()
            .url("Must be a valid Telegram deep link")
            .optional(),
        },
      }),
      tanstackRouter({
        target: "react",
        autoCodeSplitting: true,
      }),
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        "@": "/src",
        "@components": "/src/components",
        "@utils": "/src/utils",
        "@hooks": "/src/hooks",
      },
    },
    server: {
      // In development, allow all hosts for local tunneling (Tailscale Funnel, etc.)
      // In production, use the whitelist from VITE_ALLOWED_HOSTS
      allowedHosts: mode === "development" ? true : allowedHosts,
    },
  };
});
