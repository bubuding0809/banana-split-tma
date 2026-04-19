import { SignJWT, jwtVerify } from "jose";
import * as cookieLib from "cookie";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { env } from "./env.js";

export const SESSION_COOKIE = "admin_session";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export type SessionPayload = {
  sub: string;
  username?: string;
  firstName: string;
};

function secret(): Uint8Array {
  return new TextEncoder().encode(env.ADMIN_SESSION_SECRET);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({
    username: payload.username,
    firstName: payload.firstName,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret());
}

export async function verifySession(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub) return null;
    return {
      sub: payload.sub,
      username:
        typeof payload.username === "string" ? payload.username : undefined,
      firstName: typeof payload.firstName === "string" ? payload.firstName : "",
    };
  } catch {
    return null;
  }
}

export async function readSession(
  req: VercelRequest
): Promise<SessionPayload | null> {
  const header = req.headers.cookie;
  if (!header) return null;
  const parsed = cookieLib.parse(header);
  const token = parsed[SESSION_COOKIE];
  if (!token) return null;
  return verifySession(token);
}

export function setSessionCookie(res: VercelResponse, token: string): void {
  const serialized = cookieLib.serialize(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
    domain: env.ADMIN_COOKIE_DOMAIN,
  });
  res.setHeader("Set-Cookie", serialized);
}

export function clearSessionCookie(res: VercelResponse): void {
  const serialized = cookieLib.serialize(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    domain: env.ADMIN_COOKIE_DOMAIN,
  });
  res.setHeader("Set-Cookie", serialized);
}
