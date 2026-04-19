import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireSession } from "../_lib/requireSession.js";
import { proxyToLambda } from "../_lib/proxy.js";
import { env } from "../_lib/env.js";

export const config = { api: { bodyParser: false } };

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!(await requireSession(req, res))) return;

  const target = `${env.ADMIN_LAMBDA_URL}/admin/broadcast`;
  await proxyToLambda(req, res, target);
}
