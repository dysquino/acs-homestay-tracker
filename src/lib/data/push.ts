"use server";

import { prisma } from "@/lib/prisma";
import { notifyDevice, pushConfigured } from "@/lib/push-server";

import { requireSiteAccess } from "./access";

/** What one device wants to be told about. */
export type PushPrefs = { requests: boolean; summary: boolean; airbnb: boolean };

export type PushDevice = PushPrefs & { endpoint: string; ownerName: string; deviceLabel: string };

type BrowserSubscription = { endpoint: string; keys: { p256dh: string; auth: string } };

const clean = (s: unknown, max: number) => String(s ?? "").trim().slice(0, max);

function validSubscription(sub: BrowserSubscription): boolean {
  try {
    const url = new URL(sub.endpoint);
    return url.protocol === "https:" && Boolean(sub.keys?.p256dh) && Boolean(sub.keys?.auth);
  } catch {
    return false;
  }
}

/** Whether the server can send at all (the VAPID keys are set). */
export async function pushAvailable(): Promise<boolean> {
  await requireSiteAccess();
  return pushConfigured();
}

/** This device's saved settings, or null if it isn't signed up. */
export async function getPushDevice(endpoint: string): Promise<PushDevice | null> {
  await requireSiteAccess();
  const row = await prisma.pushSubscription.findUnique({ where: { endpoint: clean(endpoint, 2000) } });
  return row
    ? {
        endpoint: row.endpoint,
        ownerName: row.ownerName,
        deviceLabel: row.deviceLabel,
        requests: row.notifyRequests,
        summary: row.notifySummary,
        airbnb: row.notifyAirbnb,
      }
    : null;
}

/** Signs this device up (or refreshes its keys), keeping its existing choices. */
export async function savePushSubscription(
  sub: BrowserSubscription,
  ownerName: string,
  deviceLabel: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireSiteAccess();
  if (!validSubscription(sub)) return { ok: false, error: "This browser gave an invalid subscription." };
  const data = {
    p256dh: clean(sub.keys.p256dh, 200),
    auth: clean(sub.keys.auth, 100),
    ownerName: clean(ownerName, 200) || "Unknown",
    deviceLabel: clean(deviceLabel, 60),
  };
  await prisma.pushSubscription.upsert({
    where: { endpoint: clean(sub.endpoint, 2000) },
    create: { endpoint: clean(sub.endpoint, 2000), ...data },
    update: data,
  });
  return { ok: true };
}

export async function updatePushPrefs(endpoint: string, prefs: PushPrefs): Promise<void> {
  await requireSiteAccess();
  await prisma.pushSubscription.updateMany({
    where: { endpoint: clean(endpoint, 2000) },
    data: { notifyRequests: Boolean(prefs.requests), notifySummary: Boolean(prefs.summary), notifyAirbnb: Boolean(prefs.airbnb) },
  });
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  await requireSiteAccess();
  await prisma.pushSubscription.deleteMany({ where: { endpoint: clean(endpoint, 2000) } });
}

/** "Send a test" — to this device only. */
export async function sendTestPush(endpoint: string): Promise<{ ok: boolean; error?: string }> {
  await requireSiteAccess();
  const result = await notifyDevice(clean(endpoint, 2000), {
    title: "Notifications are on",
    body: "This is how ACs Homestay alerts will look on this device.",
    url: "/payment-settings#notifications",
    tag: "test",
  });
  if (result.sent === 1) return { ok: true };
  if (result.removed === 1) return { ok: false, error: "This device's notifications were turned off. Turn them on again." };
  return { ok: false, error: "The test couldn't be delivered. Please try again." };
}
