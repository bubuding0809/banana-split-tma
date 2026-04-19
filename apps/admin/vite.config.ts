import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { adminDevApi } from "./vite/devApi";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), adminDevApi()],
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  server: {
    host: true,
    port: 6820,
    allowedHosts: true,
  },
});
