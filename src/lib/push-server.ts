import "server-only";

import webpush from "web-push";

import type { NotificationKind, PushPayload } from "./notifications";
import { prisma } from "./prisma";

/**
 * Sends Web Push notifications to the owners' devices. Needs the VAPID key
 * pair (NEXT_PUBLIC_VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY) and VAPID_SUBJECT
 * (a mailto: the push services can reach about problems). Without them,
 * notifications are simply off — nothing else in the app depends on this.
 */

export function pushConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}

let configured = false;
function configure(): boolean {
  if (!pushConfigured()) return false;
  if (!configured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT!,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!,
    );
    configured = true;
  }
  return true;
}

const PREF: Record<NotificationKind, "notifyRequests" | "notifySummary" | "notifyAirbnb"> = {
  requests: "notifyRequests",
  summary: "notifySummary",
  airbnb: "notifyAirbnb",
};

export type SendResult = { sent: number; failed: number; removed: number };

type Target = { id: string; endpoint: string; p256dh: string; auth: string };

/**
 * Delivers to the given devices. A device the push service says is gone
 * (404/410: notifications turned off, app removed) is deleted, so it isn't
 * tried again. Other failures are counted and left for next time.
 */
async function deliver(targets: Target[], payload: PushPayload): Promise<SendResult> {
  const result: SendResult = { sent: 0, failed: 0, removed: 0 };
  if (!configure() || targets.length === 0) return result;
  const body = JSON.stringify(payload);
  const sentIds: string[] = [];
  await Promise.all(
    targets.map(async (t) => {
      try {
        await webpush.sendNotification({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, body, {
          TTL: 12 * 60 * 60, // a phone that's off for the night still gets it in the morning
          urgency: "high",
        });
        result.sent++;
        sentIds.push(t.id);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await prisma.pushSubscription.deleteMany({ where: { id: t.id } });
          result.removed++;
        } else {
          result.failed++;
          console.error(`Push to device ${t.id} failed (${status ?? "no status"})`);
        }
      }
    }),
  );
  if (sentIds.length) {
    await prisma.pushSubscription.updateMany({ where: { id: { in: sentIds } }, data: { lastSentAt: new Date() } });
  }
  return result;
}

/** Sends to every device that wants this kind of notification. */
export async function notifyOwners(kind: NotificationKind, payload: PushPayload): Promise<SendResult> {
  if (!pushConfigured()) return { sent: 0, failed: 0, removed: 0 };
  const targets = await prisma.pushSubscription.findMany({
    where: { [PREF[kind]]: true },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });
  return deliver(targets, payload);
}

/** One device only — the "Send a test" button. */
export async function notifyDevice(endpoint: string, payload: PushPayload): Promise<SendResult> {
  const target = await prisma.pushSubscription.findUnique({
    where: { endpoint },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });
  return deliver(target ? [target] : [], payload);
}
