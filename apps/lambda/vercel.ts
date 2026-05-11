import { routes, type VercelConfig } from "@vercel/config/v1";

/** Vercel project configuration for the Lambda API server. */
export const config: VercelConfig = {
  git: {
    deploymentEnabled: false,
  },
  ignoreCommand: "npx turbo-ignore",
  regions: ["sin1"],
  rewrites: [routes.rewrite("/(.*)", "/api")],
  crons: [
    // Saturday 09:00 SGT ≈ Saturday 01:00 UTC. Runs ~36h before the
    // Sunday 21:00 SGT group-reminder fire batch so a missing schedule
    // self-heals before users would notice it skipped.
    {
      path: "/api/internal/reconcile-group-reminders",
      schedule: "0 1 * * 6",
    },
  ],
};
