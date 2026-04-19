import type { VercelRequest, VercelResponse } from "@vercel/node";
import { readSession, type SessionPayload } from "./session.js";
import { isAllowed } from "./allowlist.js";
import { env } from "./env.js";

export const DEV_BYPASS_SESSION: SessionPayload = {
  sub: "0",
  username: "dev",
  firstName: "Dev",
};

export async function requireSession(
  req: VercelRequest,
  res: VercelResponse
): Promise<SessionPayload | null> {
  if (env.ADMIN_DEV_BYPASS === "1") return DEV_BYPASS_SESSION;

  const session = await readSession(req);
  if (!session || !isAllowed(Number(session.sub))) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }
  return session;
}
