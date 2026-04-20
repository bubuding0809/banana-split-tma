import type { Connect, Plugin, ViteDevServer } from "vite";
import type { ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

type RouteDef = {
  method?: string;
  match: RegExp | string;
  module: string;
  parseJson?: boolean;
};

const ROUTES: RouteDef[] = [
  {
    method: "POST",
    match: "/api/auth/telegram",
    module: "/api/auth/telegram.ts",
    parseJson: true,
  },
  {
    method: "POST",
    match: "/api/auth/apikey",
    module: "/api/auth/apikey.ts",
    parseJson: true,
  },
  {
    method: "GET",
    match: "/api/auth/me",
    module: "/api/auth/me.ts",
  },
  {
    method: "POST",
    match: "/api/auth/logout",
    module: "/api/auth/logout.ts",
  },
  {
    match: /^\/api\/admin\/trpc\//,
    module: "/api/admin/trpc/[...slug].ts",
  },
  {
    method: "POST",
    match: "/api/admin/broadcast",
    module: "/api/admin/broadcast.ts",
  },
];

function loadDevEnv(rootDir: string): void {
  const envFile = path.resolve(rootDir, "env/.env.development");
  if (!existsSync(envFile)) return;
  const raw = readFileSync(envFile, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

async function readBody(req: Connect.IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

function patchResponse(res: ServerResponse): void {
  const anyRes = res as ServerResponse & {
    status?: (code: number) => ServerResponse;
    json?: (body: unknown) => void;
    send?: (body: string | Buffer) => void;
  };

  if (!anyRes.status) {
    anyRes.status = (code: number) => {
      res.statusCode = code;
      return res;
    };
  }
  if (!anyRes.send) {
    anyRes.send = (body: string | Buffer) => {
      if (Buffer.isBuffer(body)) {
        res.end(body);
      } else {
        res.end(body);
      }
    };
  }
  if (!anyRes.json) {
    anyRes.json = (body: unknown) => {
      if (!res.getHeader("Content-Type")) {
        res.setHeader("Content-Type", "application/json");
      }
      res.end(JSON.stringify(body));
    };
  }
}

function matchRoute(method: string, pathname: string): RouteDef | null {
  for (const route of ROUTES) {
    if (route.method && route.method !== method) continue;
    if (typeof route.match === "string") {
      if (route.match === pathname) return route;
    } else if (route.match.test(pathname)) {
      return route;
    }
  }
  return null;
}

export function adminDevApi(): Plugin {
  let server: ViteDevServer | undefined;

  return {
    name: "admin-dev-api",
    apply: "serve",
    configResolved(config) {
      loadDevEnv(config.root);
    },
    configureServer(devServer) {
      server = devServer;

      devServer.middlewares.use(async (req, res, next) => {
        const rawUrl = req.originalUrl ?? req.url ?? "";
        const [pathname] = rawUrl.split("?");
        if (!pathname.startsWith("/api/")) return next();

        const method = req.method ?? "GET";
        const route = matchRoute(method, pathname);
        if (!route) return next();

        try {
          if (route.parseJson) {
            const body = await readBody(req);
            const text = body.toString("utf8");
            (req as Connect.IncomingMessage & { body?: unknown }).body = text
              ? JSON.parse(text)
              : {};
          }

          patchResponse(res);

          const mod = await server!.ssrLoadModule(route.module);
          const handler = (mod as { default?: unknown }).default;
          if (typeof handler !== "function") {
            res.statusCode = 500;
            res.end("Handler did not export a default function");
            return;
          }
          await (handler as (req: unknown, res: unknown) => unknown)(req, res);
        } catch (err) {
          server!.ssrFixStacktrace(err as Error);
          const message = err instanceof Error ? err.message : String(err);
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: message }));
        }
      });
    },
  };
}
