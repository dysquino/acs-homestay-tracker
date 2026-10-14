"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button, LinkButton } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/field";
import {
  CalendarIcon,
  CheckIcon,
  CopyIcon,
} from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import {
  listStayPreparation,
  saveDoorPasscode,
} from "@/lib/data/stay-preparation";
import { today } from "@/lib/dates";
import { formatDateRange } from "@/lib/format";
import { useIdentity } from "@/lib/identity";
import { knownCleaners } from "@/lib/selectors";
import {
  messageVariables,
  renderGuestMessage,
  suggestDoorPasscode,
  type GuestMessageTemplate,
  type StayPreparationData,
} from "@/lib/stay-preparation";
import { DEFAULT_CLEANING_FEE, useStore } from "@/lib/store";
import type { Booking } from "@/lib/types";

const EMPTY: StayPreparationData = {
  doorPasscodes: {},
  wifiName: "",
  wifiPassword: "",
  checkInTime: "2:00 PM",
  checkOutTime: "11:00 AM",
  hostSignature: "The ACs",
  templates: [],
};
const COLLAPSED = 5;

export function UpcomingStays() {
  const { bookings, cleaning } = useStore();
  const [data, setData] = useState<StayPreparationData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<Booking | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      setData(await listStayPreparation());
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void listStayPreparation().then(
      (result) => {
        if (!active) return;
        setData(result);
        setLoading(false);
      },
      () => {
        if (!active) return;
        setLoadError(true);
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  const upcoming = useMemo(
    () => bookings.filter((booking) => booking.checkOut >= today()).sort((a, b) => a.checkIn.localeCompare(b.checkIn)),
    [bookings],
  );
  const shown = expanded ? upcoming : upcoming.slice(0, COLLAPSED);

  return (
    <>
      <Card>
        <CardHeader
          icon={CalendarIcon}
          title={`Upcoming stays${upcoming.length ? ` (${upcoming.length})` : ""}`}
          description="Add arrival details, prepare guest messages, and assign the turnover cleaner."
        />

        {loading ? (
          <p className="border-t border-slate-100 px-5 py-5 text-sm text-slate-500">Loading stay details…</p>
        ) : loadError ? (
          <div className="border-t border-slate-100 px-5 py-4">
            <p className="text-sm text-red-700">Couldn&apos;t load stay preparation details.</p>
            <Button size="sm" className="mt-2" onClick={() => void load()}>Retry</Button>
          </div>
        ) : upcoming.length === 0 ? (
          <p className="border-t border-slate-100 px-5 py-5 text-sm text-slate-500">No upcoming bookings.</p>
        ) : (
          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {shown.map((booking) => {
              const turnover = cleaning.find((item) => item.bookingId === booking.id);
              const hasPasscode = Boolean(data.doorPasscodes[booking.id]?.trim());
              const hasCleaner = Boolean(turnover?.cleanerName.trim());
              return (
                <li key={booking.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                  <div className="min-w-44 flex-1">
                    <p className="text-sm font-medium text-slate-900">{booking.guestName}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{formatDateRange(booking.checkIn, booking.checkOut)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <StatusPill complete={hasPasscode} label={hasPasscode ? "Passcode added" : "Needs passcode"} />
                    <StatusPill complete={hasCleaner} label={hasCleaner ? turnover?.cleanerName ?? "Cleaner assigned" : "Needs cleaner"} />
                  </div>
                  <Button size="sm" variant={hasPasscode && hasCleaner ? "secondary" : "primary"} onClick={() => setSelected(booking)}>
                    {hasPasscode && hasCleaner ? "View & message" : "Prepare"}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-2">
          <div>
            {upcoming.length > COLLAPSED ? (
              <button type="button" onClick={() => setExpanded((value) => !value)} className="text-xs font-medium text-brand-700 hover:underline pointer-coarse:py-2">
                {expanded ? "Show fewer" : `Show all (${upcoming.length})`}
              </button>
            ) : null}
          </div>
          <LinkButton size="sm" variant="ghost" href="/payment-settings#guest-messages">
            Message settings
          </LinkButton>
        </div>
      </Card>

      {selected ? (
        <StayPreparationModal
          key={selected.id}
          booking={selected}
          data={data}
          onClose={() => setSelected(null)}
          onPasscodeSaved={(bookingId, value) =>
            setData((current) => ({ ...current, doorPasscodes: { ...current.doorPasscodes, [bookingId]: value } }))
          }
        />
      ) : null}
    </>
  );
}
function StatusPill({ complete, label }: { complete: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 ${complete ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
      {complete ? <CheckIcon className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {label}
    </span>
  );
}

function StayPreparationModal({
  booking,
  data,
  onClose,
  onPasscodeSaved,
}: {
  booking: Booking;
  data: StayPreparationData;
  onClose: () => void;
  onPasscodeSaved: (bookingId: string, value: string) => void;
}) {
  const { cleaning, addCleaning, updateCleaning } = useStore();
  const { user } = useIdentity();
  const turnover = cleaning.find((item) => item.bookingId === booking.id);
  const savedPasscode = data.doorPasscodes[booking.id] ?? "";
  const initialPasscode = savedPasscode || suggestDoorPasscode(booking);
  const [passcode, setPasscode] = useState(initialPasscode);
  const [cleaner, setCleaner] = useState(turnover?.cleanerName ?? "");
  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    const variables = messageVariables(
      booking,
      data.wifiName,
      data.wifiPassword,
      initialPasscode,
      data.checkInTime,
      data.checkOutTime,
      data.hostSignature,
    );
    return Object.fromEntries(data.templates.map((template) => [template.id, renderGuestMessage(template.body, variables)]));
  });
  const [editedDrafts, setEditedDrafts] = useState<Set<string>>(() => new Set());
  const [saving, setSaving] = useState<"passcode" | "cleaner" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function saveCode() {
    setSaving("passcode");
    setError(null);
    try {
      await saveDoorPasscode(booking!.id, passcode);
      onPasscodeSaved(booking!.id, passcode.trim());
    } catch {
      setError("Couldn’t save the passcode. Please try again.");
    } finally {
      setSaving(null);
    }
  }

  async function saveCleaner() {
    setSaving("cleaner");
    setError(null);
    try {
      if (turnover) {
        await updateCleaning(turnover.id, { cleanerName: cleaner.trim() });
      } else {
        await addCleaning({
          date: booking!.checkOut,
          bookingId: booking!.id,
          cleanerName: cleaner.trim(),
          status: "scheduled",
          paymentAmount: DEFAULT_CLEANING_FEE,
          paymentStatus: "unpaid",
          notes: "",
          createdBy: user?.name ?? "Unknown",
        });
      }
    } catch {
      setError("Couldn’t assign the cleaner. Please try again.");
    } finally {
      setSaving(null);
    }
  }

  function refreshDraft(template: GuestMessageTemplate) {
    const variables = messageVariables(
      booking,
      data.wifiName,
      data.wifiPassword,
      passcode,
      data.checkInTime,
      data.checkOutTime,
      data.hostSignature,
    );
    setDrafts((current) => ({ ...current, [template.id]: renderGuestMessage(template.body, variables) }));
    setEditedDrafts((current) => {
      const next = new Set(current);
      next.delete(template.id);
      return next;
    });
  }

  function changePasscode(value: string) {
    setPasscode(value);
    const variables = messageVariables(
      booking,
      data.wifiName,
      data.wifiPassword,
      value,
      data.checkInTime,
      data.checkOutTime,
      data.hostSignature,
    );
    setDrafts((current) => Object.fromEntries(data.templates.map((template) => [
      template.id,
      editedDrafts.has(template.id)
        ? current[template.id] ?? ""
        : renderGuestMessage(template.body, variables),
    ])));
  }

  async function copyMessage(templateId: string) {
    try {
      await navigator.clipboard.writeText(drafts[templateId] ?? "");
      setCopied(templateId);
      window.setTimeout(() => setCopied((current) => (current === templateId ? null : current)), 1800);
    } catch {
      setError("Couldn’t copy the message. Select the text and copy it manually.");
    }
  }

  return (
    <Modal open title={`Prepare ${booking.guestName}’s stay`} description={formatDateRange(booking.checkIn, booking.checkOut)} onClose={onClose} wide>
      <div className="space-y-5">
        <ChecklistSection number="1" title="Add the door passcode" complete={Boolean(data.doorPasscodes[booking.id]?.trim())}>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex-1">
              <Input value={passcode} onChange={(event) => changePasscode(event.target.value)} placeholder="Enter the passcode for this stay" autoComplete="off" />
              {!savedPasscode ? (
                <p className="mt-1 text-xs text-slate-500">
                  Suggested from the guest contact and check-in date. Seven digits plus #.
                </p>
              ) : null}
            </div>
            <Button variant="primary" disabled={saving !== null || passcode.trim() === data.doorPasscodes[booking.id]?.trim()} onClick={() => void saveCode()}>
              {saving === "passcode" ? "Saving…" : "Save passcode"}
            </Button>
          </div>
        </ChecklistSection>

        <ChecklistSection number="2" title="Prepare guest messages" complete={data.templates.length > 0}>
          {data.templates.length === 0 ? (
            <p className="text-sm text-slate-500">Add a message template from the Templates button on the dashboard.</p>
          ) : (
            <div className="space-y-3">
              {data.templates.map((template) => (
                <div key={template.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-800">{template.name}</p>
                    <button type="button" onClick={() => refreshDraft(template)} className="text-xs font-medium text-brand-700 hover:underline">Refresh variables</button>
                  </div>
                  <Textarea rows={5} value={drafts[template.id] ?? ""} onChange={(event) => {
                    setDrafts((current) => ({ ...current, [template.id]: event.target.value }));
                    setEditedDrafts((current) => new Set(current).add(template.id));
                  }} />
                  <div className="mt-2 flex justify-end">
                    <Button size="sm" variant="primary" onClick={() => void copyMessage(template.id)}>
                      {copied === template.id ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
                      {copied === template.id ? "Copied" : "Copy message"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ChecklistSection>

        <ChecklistSection number="3" title="Assign the turnover cleaner" complete={Boolean(turnover?.cleanerName.trim())}>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex-1">
              <Input list="upcoming-stay-cleaners" value={cleaner} onChange={(event) => setCleaner(event.target.value)} placeholder="Cleaner name" />
              <datalist id="upcoming-stay-cleaners">
                {knownCleaners(cleaning).map((name) => <option key={name} value={name} />)}
              </datalist>
            </div>
            <Button variant="primary" disabled={saving !== null || cleaner.trim() === (turnover?.cleanerName ?? "").trim()} onClick={() => void saveCleaner()}>
              {saving === "cleaner" ? "Saving…" : "Save cleaner"}
            </Button>
          </div>
        </ChecklistSection>

        {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      </div>
    </Modal>
  );
}

function ChecklistSection({ number, title, complete, children }: { number: string; title: string; complete: boolean; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${complete ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
          {complete ? <CheckIcon className="h-3.5 w-3.5" /> : number}
        </span>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      </div>
      <div className="ml-8">{children}</div>
    </section>
  );
}
