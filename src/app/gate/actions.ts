"use server";

import { createHmac } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE_NAME = "site_gate";
const TOKEN_INPUT = "granted";

export type GateState = { error?: string } | undefined;

function safeTarget(from: string): string {
  // Only ever redirect back into this app, never to an external host.
  return from.startsWith("/") && !from.startsWith("//") ? from : "/";
}

export async function unlockSite(
  _prevState: GateState,
  formData: FormData,
): Promise<GateState> {
  const password = String(formData.get("password") ?? "");
  const target = safeTarget(String(formData.get("from") ?? "/"));
  const expected = process.env.SITE_PASSWORD;

  if (!expected) {
    // Not configured: nothing to unlock in development; in production the
    // proxy is already refusing every request, so never wave anyone through.
    if (process.env.NODE_ENV === "production") {
      return { error: "Access is not configured on this site." };
    }
    redirect(target);
  }

  if (password !== expected) {
    return { error: "Incorrect access code." };
  }

  const token = createHmac("sha256", expected).update(TOKEN_INPUT).digest("hex");
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  redirect(target);
}
