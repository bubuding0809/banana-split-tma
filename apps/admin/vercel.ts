import { type VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "vite",
  git: {
    deploymentEnabled: false,
  },
  ignoreCommand: "npx turbo-ignore",
  regions: ["sin1"],
};
