import express, { Router } from "express";
import cors from "cors";

import {
  appRouter,
  trpcExpress,
  withCreateTRPCContext,
  openApiDocument,
} from "@dko/trpc";
import { createOpenApiExpressMiddleware } from "trpc-to-openapi";
import { env } from "./env.js";

//* Create an express app
const app = express();
app.use(cors());

//* Create a router to handle all API requests
const router = Router();

//* Route all TRPC requests to the TRPC middleware
router.use(
  "/trpc",
  trpcExpress.createExpressMiddleware({
    router: appRouter,
    createContext: withCreateTRPCContext(env),
  })
);

//* Add REST endpoints for TRPC
router.use(
  "/rest",
  createOpenApiExpressMiddleware({
    router: appRouter,
    createContext: withCreateTRPCContext(env),
  })
);

router.get("/swagger", (_req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.status(200).json(openApiDocument);
});

//* Add TRPC panel for testing APIs in development
router.use("/panel", async (_req, res) => {
  const isDevelopment =
    process.env.NODE_ENV === "development" ||
    process.env.VERCEL_ENV === "development";
  const { renderTrpcPanel = null } = isDevelopment
    ? await import("trpc-ui")
    : {};

  if (!renderTrpcPanel) {
    res
      .status(404)
      .json({ message: "TRPC panel not found in this environment" });
    return;
  }

  // Only render the panel in development
  res.send(
    renderTrpcPanel(appRouter as any, {
      url: "/api/trpc",
      meta: {
        title: "DKO TRPC API",
        description: "🚀Test your TRPC APIs here 🚀",
      },
      transformer: "superjson",
    })
  );
});

app.use("/api", router);

//Root path for health check
app.get("/", (_req, res) => {
  res.status(200).json({ message: "Hello from DKO TRPC API" });
});

export default app;
