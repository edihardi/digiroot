import { cookies } from "next/headers";
import crypto from "crypto";
import { getTelegramToken } from "./store";

const SESSION_COOKIE = "dg_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function getSecret(): string {
  return getTelegramToken() || "digiroot-fallback-secret";
}

function sign(value: string): string {
  const hmac = crypto.createHmac("sha256", getSecret());
  hmac.update(value);
  return value + "." + hmac.digest("hex");
}

function verify(signed: string): string | null {
  const idx = signed.lastIndexOf(".");
  if (idx === -1) return null;
  const value = signed.slice(0, idx);
  if (sign(value) === signed) return value;
  return null;
}

export async function createSession(): Promise<void> {
  const token = sign(Date.now().toString());
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function isAuthenticated(): Promise<boolean> {
  const store = await cookies();
  const cookie = store.get(SESSION_COOKIE);
  if (!cookie?.value) return false;
  return verify(cookie.value) !== null;
}

export function checkPassword(input: string): boolean {
  const password = process.env.DASHBOARD_PASSWORD || "Super76##";
  return input === password;
}
