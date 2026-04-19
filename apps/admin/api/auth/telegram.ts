import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyTelegramAuth } from "../_lib/telegramAuth.js";
import { isAllowed } from "../_lib/allowlist.js";
import { setSessionCookie, signSession } from "../_lib/session.js";

type AuthInput = {
  id: number;
  auth_date: number;
  first_name: string;
  hash: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
};

function parseAuthInput(
  source: Record<string, unknown>
): AuthInput | { error: string } {
  const id = Number(source.id);
  const authDate = Number(source.auth_date);
  if (
    !Number.isFinite(id) ||
    !Number.isFinite(authDate) ||
    typeof source.first_name !== "string" ||
    typeof source.hash !== "string"
  ) {
    return { error: "Missing or invalid fields" };
  }
  return {
    id,
    auth_date: authDate,
    first_name: source.first_name,
    hash: source.hash,
    last_name:
      typeof source.last_name === "string" ? source.last_name : undefined,
    username: typeof source.username === "string" ? source.username : undefined,
    photo_url:
      typeof source.photo_url === "string" ? source.photo_url : undefined,
  };
}

function flattenQuery(query: VercelRequest["query"]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(query)) {
    out[key] = Array.isArray(value) ? value[0] : value;
  }
  return out;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const method = req.method ?? "GET";
  const isRedirect = method === "GET";

  const source =
    method === "POST"
      ? typeof req.body === "object" && req.body
        ? (req.body as Record<string, unknown>)
        : null
      : flattenQuery(req.query);

  if (!source) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const parsed = parseAuthInput(source);
  if ("error" in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  const identity = verifyTelegramAuth(parsed);
  if (!identity) {
    res.status(401).json({ error: "Invalid Telegram signature" });
    return;
  }

  if (!isAllowed(identity.telegramId)) {
    res.status(403).json({ error: "Not on allowlist" });
    return;
  }

  const token = await signSession({
    sub: String(identity.telegramId),
    username: identity.username,
    firstName: identity.firstName,
  });
  setSessionCookie(res, token);

  if (isRedirect) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(`<!DOCTYPE html>
<meta charset="utf-8">
<title>Signed in</title>
<script>
  (function () {
    try {
      localStorage.setItem("admin_auth_ping", String(Date.now()));
    } catch (e) {}
    try {
      if (window.opener && !window.opener.closed) {
        window.close();
        setTimeout(function () { window.location.replace("/"); }, 150);
        return;
      }
    } catch (e) {}
    window.location.replace("/");
  })();
</script>`);
    return;
  }

  res.status(200).json({
    telegramId: identity.telegramId,
    username: identity.username ?? null,
    firstName: identity.firstName,
  });
}
