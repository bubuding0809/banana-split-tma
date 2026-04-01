import { routes, type VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  git: {
    deploymentEnabled: {
      main: false,
    },
  },
  ignoreCommand: "npx turbo-ignore",
  rewrites: [routes.rewrite("/(.*)", "/")],
};
