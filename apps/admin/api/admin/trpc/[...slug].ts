import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireSession } from "../../_lib/requireSession.js";
import { proxyToLambda } from "../../_lib/proxy.js";
import { env } from "../../_lib/env.js";

export const config = { api: { bodyParser: false } };

const PREFIX = "/api/admin/trpc";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (!(await requireSession(req, res))) return;

  const url = req.url ?? "";
  const trailing = url.startsWith(PREFIX) ? url.slice(PREFIX.length) : url;
  const target = `${env.ADMIN_LAMBDA_URL}/trpc${trailing}`;

  await proxyToLambda(req, res, target);
}
