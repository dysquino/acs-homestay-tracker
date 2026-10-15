"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  getPushDevice,
  pushAvailable,
  removePushSubscription,
  savePushSubscription,
  sendTestPush,
  updatePushPrefs,
  type PushPrefs,
} from "@/lib/data/push";
import { useIdentity } from "@/lib/identity";

/**
 * Turn the owners' phone notifications on or off for THIS device, and pick
 * which ones it gets. Each phone signs up on its own — notifications go to
 * devices, not people. On an iPhone this only works in the app added to the
 * Home Screen (iOS 16.4+), and the permission prompt must come from a tap.
 */

type State =
  | "loading"
  | "unsupported"
  | "install-first" // iPhone/iPad in the browser, not the Home Screen app
  | "server-off" // the VAPID keys aren't set yet
  | "denied"
  | "off"
  | "on";

const OPTIONS: { key: keyof PushPrefs; label: string; hint: string }[] = [
  { key: "requests", label: "New booking requests", hint: "Right away, when a guest sends one through your booking link." },
  { key: "summary", label: "Morning summary", hint: "8:00 AM: today's check-ins and check-outs, and what needs doing." },
  { key: "airbnb", label: "New Airbnb reservations", hint: "When one appears on your Airbnb calendar (checked every hour)." },
];

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

function deviceLabel(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Mac/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  return "This device";
}

/** The VAPID public key, as the bytes pushManager.subscribe wants. */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export function NotificationSettings() {
  const { user } = useIdentity();
  const [state, setState] = useState<State>("loading");
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<PushPrefs>({ requests: true, summary: true, airbnb: true });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      if (!supported) {
        if (!cancelled) setState(isIos() && !isStandalone() ? "install-first" : "unsupported");
        return;
      }
      if (!PUBLIC_KEY || !(await pushAvailable())) {
        if (!cancelled) setState("server-off");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setState("denied");
        return;
      }
      const registration = await navigator.serviceWorker.getRegistration("/");
      const sub = await registration?.pushManager.getSubscription();
      const device = sub ? await getPushDevice(sub.endpoint) : null;
      if (cancelled) return;
      if (sub && device) {
        setEndpoint(sub.endpoint);
        setPrefs({ requests: device.requests, summary: device.summary, airbnb: device.airbnb });
        setState("on");
      } else {
        setState("off");
      }
    })().catch(() => {
      if (!cancelled) setState("off");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function turnOn() {
    setBusy(true);
    setMessage(null);
    try {
      // Ask first, straight from the tap — iOS only shows the prompt then.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const sub =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(PUBLIC_KEY) }));
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const saved = await savePushSubscription(json, user?.name ?? "Unknown", deviceLabel());
      if (!saved.ok) throw new Error(saved.error);
      // A device signing up again keeps its earlier choices.
      const device = await getPushDevice(sub.endpoint);
      if (device) setPrefs({ requests: device.requests, summary: device.summary, airbnb: device.airbnb });
      setEndpoint(sub.endpoint);
      setState("on");
      setMessage({ tone: "ok", text: "Notifications are on for this device." });
    } catch {
      setMessage({ tone: "error", text: "Couldn't turn on notifications. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    if (!endpoint) return;
    setBusy(true);
    setMessage(null);
    try {
      await removePushSubscription(endpoint);
      const registration = await navigator.serviceWorker.getRegistration("/");
      await (await registration?.pushManager.getSubscription())?.unsubscribe();
      setEndpoint(null);
      setState("off");
    } catch {
      setMessage({ tone: "error", text: "Couldn't turn notifications off. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  async function toggle(key: keyof PushPrefs, value: boolean) {
    if (!endpoint) return;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    try {
      await updatePushPrefs(endpoint, next);
    } catch {
      setPrefs(prefs);
      setMessage({ tone: "error", text: "Couldn't save that change. Please try again." });
    }
  }

  async function test() {
    if (!endpoint) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await sendTestPush(endpoint);
      setMessage(result.ok ? { tone: "ok", text: "Test sent — it should arrive in a few seconds." } : { tone: "error", text: result.error ?? "The test couldn't be delivered." });
      if (!result.ok && /turned off/.test(result.error ?? "")) setState("off");
    } catch {
      setMessage({ tone: "error", text: "The test couldn't be sent. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 p-4 text-sm text-slate-700 sm:p-5">
      {state === "loading" ? <p className="text-slate-500">Checking this device…</p> : null}

      {state === "install-first" ? (
        <p>
          On an iPhone, notifications work in the app on your Home Screen. In Safari, tap <strong>Share</strong> →{" "}
          <strong>Add to Home Screen</strong>, open ACs Homestay from there, and come back to this page. (Needs iOS
          16.4 or newer.)
        </p>
      ) : null}

      {state === "unsupported" ? (
        <p>This browser can&apos;t receive notifications. Try the app on your phone&apos;s Home Screen, or Chrome.</p>
      ) : null}

      {state === "server-off" ? (
        <p>
          Notifications aren&apos;t set up yet: the <code>VAPID</code> keys still need to be added in Vercel.
        </p>
      ) : null}

      {state === "denied" ? (
        <p>
          Notifications are blocked for this app. Allow them in your phone&apos;s settings (iPhone: Settings →
          Notifications → ACs Homestay), then reopen this page.
        </p>
      ) : null}

      {state === "off" ? (
        <div className="space-y-3">
          <p>Get an alert on this device for new booking requests, a morning summary, and new Airbnb reservations.</p>
          <Button variant="primary" onClick={turnOn} disabled={busy}>
            {busy ? "Turning on…" : "Turn on notifications"}
          </Button>
          <p className="text-xs text-slate-500">Each phone is set up on its own — do this on every device that should get alerts.</p>
        </div>
      ) : null}

      {state === "on" ? (
        <div className="space-y-4">
          <p className="flex items-center gap-2 font-medium text-slate-900">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-500" />
            On for this {deviceLabel() === "This device" ? "device" : deviceLabel()}
          </p>
          <div className="space-y-3">
            {OPTIONS.map((o) => (
              <label key={o.key} className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={prefs[o.key]}
                  onChange={(e) => toggle(o.key, e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-700 focus:ring-brand-600 pointer-coarse:h-5 pointer-coarse:w-5"
                />
                <span>
                  <span className="font-medium text-slate-900">{o.label}</span>
                  <span className="block text-xs text-slate-500">{o.hint}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={test} disabled={busy}>
              Send a test
            </Button>
            <Button variant="ghost" onClick={turnOff} disabled={busy}>
              Turn off on this device
            </Button>
          </div>
        </div>
      ) : null}

      {message ? (
        <p role="status" className={message.tone === "ok" ? "text-xs text-emerald-700" : "text-xs text-red-700"}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
