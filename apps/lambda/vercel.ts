import { routes, type VercelConfig } from "@vercel/config/v1";

/** Vercel project configuration for the Lambda API server. */
export const config: VercelConfig = {
  git: {
    deploymentEnabled: false,
  },
  ignoreCommand: "npx turbo-ignore",
  regions: ["sin1"],
  rewrites: [routes.rewrite("/(.*)", "/api")],
};
