// MUST come before @dko/trpc — env.js runs dotenv.config(), and the
// scheduler client in @dko/trpc captures process.env.AWS_REGION at
// module-load time. Prod is unaffected because Vercel populates
// process.env before Node starts; in dev dotenv is the only source.
import { env } from "./env.js";

import express, { Router, type Request, type Response } from "express";
import cors from "cors";
import multer from "multer";
import crypto from "node:crypto";
import { Telegram } from "telegraf";
import { prisma } from "@dko/database";

import {
  appRouter,
  trpcExpress,
  withCreateTRPCContext,
  openApiDocument,
  createBroadcast,
  type BroadcastMedia,
} from "@dko/trpc";
import { createOpenApiExpressMiddleware } from "trpc-to-openapi";
import recurringExpenseTickRouter from "./recurring-expense-tick.js";

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

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

//* Admin broadcast with media attachment (multipart/form-data)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_VIDEO_BYTES },
});

function isAuthorizedAdmin(req: Request): boolean {
  const provided = req.header("x-api-key");
  const expected = env.API_KEY;
  if (!provided || !expected) return false;
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

router.post(
  "/admin/broadcast",
  upload.single("file"),
  async (req: Request, res: Response) => {
    if (!isAuthorizedAdmin(req)) {
      res.status(401).json({ error: "Invalid or missing API Key" });
      return;
    }

    const message =
      typeof req.body.message === "string" ? req.body.message : "";
    let targetUserIds: number[] | undefined;
    const rawTargets = req.body.targetUserIds;
    if (typeof rawTargets === "string" && rawTargets.length > 0) {
      try {
        const parsed = JSON.parse(rawTargets);
        if (
          !Array.isArray(parsed) ||
          !parsed.every((n) => typeof n === "number")
        ) {
          res
            .status(400)
            .json({ error: "targetUserIds must be a JSON array of numbers" });
          return;
        }
        if (parsed.length > 200) {
          res.status(400).json({ error: "targetUserIds exceeds max of 200" });
          return;
        }
        targetUserIds = parsed;
      } catch {
        res.status(400).json({ error: "targetUserIds must be valid JSON" });
        return;
      }
    }

    let media: BroadcastMedia | undefined;
    if (req.file) {
      const mime = req.file.mimetype;
      if (mime.startsWith("image/")) {
        if (req.file.size > MAX_PHOTO_BYTES) {
          res.status(413).json({ error: "Image exceeds 10 MB limit" });
          return;
        }
        media = {
          kind: "photo",
          buffer: req.file.buffer,
          filename: req.file.originalname,
        };
      } else if (mime.startsWith("video/")) {
        media = {
          kind: "video",
          buffer: req.file.buffer,
          filename: req.file.originalname,
        };
      } else {
        res.status(400).json({ error: `Unsupported media type: ${mime}` });
        return;
      }
    }

    if (!message.trim() && !media) {
      res.status(400).json({ error: "Broadcast requires a message or media." });
      return;
    }

    try {
      const result = await createBroadcast(
        {
          db: prisma,
          teleBot: new Telegram(env.TELEGRAM_BOT_TOKEN || ""),
        },
        { message, targetUserIds, media, createdByTelegramId: null }
      );
      res.status(200).json(result);
    } catch (error) {
      console.error("Admin broadcast failed:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

//* Internal webhooks (HMAC-authenticated). Mounted under /api/internal/*.
// JSON body parser is scoped to /internal/* so it doesn't interfere with
// tRPC / openapi (which manage their own body handling) or multer (multipart).
router.use(
  "/internal",
  express.json({ limit: "1mb" }),
  recurringExpenseTickRouter
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
    renderTrpcPanel(appRouter, {
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
