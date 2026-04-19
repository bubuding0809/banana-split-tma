import type { VercelRequest, VercelResponse } from "@vercel/node";
import { readSession } from "../_lib/session.js";
import { isAllowed } from "../_lib/allowlist.js";
import { env } from "../_lib/env.js";
import { DEV_BYPASS_SESSION } from "../_lib/requireSession.js";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (env.ADMIN_DEV_BYPASS === "1") {
    res.status(200).json({
      telegramId: Number(DEV_BYPASS_SESSION.sub),
      username: DEV_BYPASS_SESSION.username ?? null,
      firstName: DEV_BYPASS_SESSION.firstName,
      devBypass: true,
    });
    return;
  }

  const session = await readSession(req);
  if (!session || !isAllowed(Number(session.sub))) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  res.status(200).json({
    telegramId: Number(session.sub),
    username: session.username ?? null,
    firstName: session.firstName,
  });
}
