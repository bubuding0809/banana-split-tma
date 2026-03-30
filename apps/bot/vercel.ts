import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  git: {
    deploymentEnabled: {
      main: false,
    },
  },
  ignoreCommand: "npx turbo-ignore",
  regions: ["fra1"],
  rewrites: [{ source: "/(.*)", destination: "/api/webhook" }],
};
