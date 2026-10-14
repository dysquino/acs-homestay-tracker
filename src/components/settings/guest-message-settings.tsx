"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { PlusIcon, TrashIcon } from "@/components/ui/icons";
import {
  createGuestMessageTemplate,
  deleteGuestMessageTemplate,
  saveStayMessageSettings,
  updateGuestMessageTemplate,
} from "@/lib/data/stay-preparation";
import {
  MESSAGE_VARIABLES,
  type GuestMessageTemplate,
  type StayPreparationData,
} from "@/lib/stay-preparation";

export function GuestMessageSettings({ initial }: { initial: StayPreparationData }) {
  const [data, setData] = useState(initial);
  const [wifiName, setWifiName] = useState(initial.wifiName);
  const [wifiPassword, setWifiPassword] = useState(initial.wifiPassword);
  const [checkInTime, setCheckInTime] = useState(initial.checkInTime);
  const [checkOutTime, setCheckOutTime] = useState(initial.checkOutTime);
  const [hostSignature, setHostSignature] = useState(initial.hostSignature);
  const [rows, setRows] = useState<Record<string, { name: string; body: string }>>(() =>
    Object.fromEntries(
      initial.templates.map((template) => [
        template.id,
        { name: template.name, body: template.body },
      ]),
    ),
  );
  const [newName, setNewName] = useState("");
  const [newBody, setNewBody] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function start(id: string) {
    setBusy(id);
    setError(null);
    setNotice(null);
  }

  async function saveDetails() {
    start("details");
    try {
      await saveStayMessageSettings({
        wifiName,
        wifiPassword,
        checkInTime,
        checkOutTime,
        hostSignature,
      });
      setData((current) => ({
        ...current,
        wifiName: wifiName.trim(),
        wifiPassword: wifiPassword.trim(),
        checkInTime: checkInTime.trim(),
        checkOutTime: checkOutTime.trim(),
        hostSignature: hostSignature.trim(),
      }));
      setNotice("Stay details saved.");
    } catch {
      setError("Couldn’t save the stay details.");
    } finally {
      setBusy(null);
    }
  }

  async function saveTemplate(template: GuestMessageTemplate) {
    const row = rows[template.id];
    if (!row) return;
    start(template.id);
    try {
      const updated = await updateGuestMessageTemplate(template.id, row);
      setData((current) => ({
        ...current,
        templates: current.templates.map((item) =>
          item.id === updated.id ? updated : item,
        ),
      }));
      setNotice(`${updated.name} saved.`);
    } catch {
      setError("Couldn’t save that template. Check that its name and message aren’t empty.");
    } finally {
      setBusy(null);
    }
  }

  async function removeTemplate(id: string) {
    start(id);
    try {
      await deleteGuestMessageTemplate(id);
      setData((current) => ({
        ...current,
        templates: current.templates.filter((item) => item.id !== id),
      }));
      setConfirmRemove(null);
      setNotice("Template removed.");
    } catch {
      setError("Couldn’t remove that template.");
    } finally {
      setBusy(null);
    }
  }

  async function addTemplate() {
    start("new");
    try {
      const created = await createGuestMessageTemplate({ name: newName, body: newBody });
      setData((current) => ({ ...current, templates: [...current.templates, created] }));
      setRows((current) => ({
        ...current,
        [created.id]: { name: created.name, body: created.body },
      }));
      setNewName("");
      setNewBody("");
      setNotice(`${created.name} added.`);
    } catch {
      setError("Couldn’t add the template. Add both a name and a message.");
    } finally {
      setBusy(null);
    }
  }

  const detailsUnchanged =
    wifiName.trim() === data.wifiName &&
    wifiPassword.trim() === data.wifiPassword &&
    checkInTime.trim() === data.checkInTime &&
    checkOutTime.trim() === data.checkOutTime &&
    hostSignature.trim() === data.hostSignature;

  return (
    <div>
      <section className="p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-slate-900">Standard stay details</h3>
        <p className="mt-1 text-xs text-slate-500">
          Reused in guest messages. Individual door passcodes are still set per booking on the dashboard.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Check-in time">
            {(id) => (
              <Input
                id={id}
                value={checkInTime}
                onChange={(event) => setCheckInTime(event.target.value)}
                placeholder="2:00 PM"
              />
            )}
          </Field>
          <Field label="Check-out time">
            {(id) => (
              <Input
                id={id}
                value={checkOutTime}
                onChange={(event) => setCheckOutTime(event.target.value)}
                placeholder="11:00 AM"
              />
            )}
          </Field>
          <Field label="Wi-Fi network name">
            {(id) => (
              <Input
                id={id}
                value={wifiName}
                onChange={(event) => setWifiName(event.target.value)}
                placeholder="Wi-Fi name"
                autoComplete="off"
              />
            )}
          </Field>
          <Field label="Wi-Fi password">
            {(id) => (
              <Input
                id={id}
                value={wifiPassword}
                onChange={(event) => setWifiPassword(event.target.value)}
                placeholder="Wi-Fi password"
                autoComplete="off"
              />
            )}
          </Field>
          <Field label="Host signature" className="sm:col-span-2">
            {(id) => (
              <Input
                id={id}
                value={hostSignature}
                onChange={(event) => setHostSignature(event.target.value)}
                placeholder="The ACs"
              />
            )}
          </Field>
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            variant="primary"
            disabled={busy !== null || detailsUnchanged}
            onClick={() => void saveDetails()}
          >
            {busy === "details" ? "Saving…" : "Save stay details"}
          </Button>
        </div>
      </section>

      <section className="border-t border-slate-100 p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-slate-900">Message templates</h3>
        <p className="mt-1 text-xs text-slate-500">
          Variables are filled from the selected booking when you prepare its message.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {MESSAGE_VARIABLES.map((name) => (
            <code key={name} className="rounded-md bg-slate-100 px-1.5 py-1 text-[11px] text-slate-600">
              {`{{${name}}}`}
            </code>
          ))}
        </div>

        <div className="mt-4 space-y-4">
          {data.templates.map((template) => {
            const row = rows[template.id] ?? { name: template.name, body: template.body };
            const unchanged = row.name === template.name && row.body === template.body;
            return (
              <div key={template.id} className="rounded-2xl border border-slate-200 p-4">
                <Field label="Template name">
                  {(id) => (
                    <Input
                      id={id}
                      value={row.name}
                      onChange={(event) =>
                        setRows((current) => ({
                          ...current,
                          [template.id]: { ...row, name: event.target.value },
                        }))
                      }
                    />
                  )}
                </Field>
                <Field label="Message" className="mt-3">
                  {(id) => (
                    <Textarea
                      id={id}
                      rows={template.id === "arrival-default" ? 16 : 6}
                      value={row.body}
                      onChange={(event) =>
                        setRows((current) => ({
                          ...current,
                          [template.id]: { ...row, body: event.target.value },
                        }))
                      }
                    />
                  )}
                </Field>
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  {confirmRemove === template.id ? (
                    <>
                      <Button size="sm" onClick={() => setConfirmRemove(null)}>Cancel</Button>
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={busy !== null}
                        onClick={() => void removeTemplate(template.id)}
                      >
                        Confirm remove
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy !== null}
                      onClick={() => setConfirmRemove(template.id)}
                    >
                      <TrashIcon className="h-3.5 w-3.5" /> Remove
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={busy !== null || unchanged}
                    onClick={() => void saveTemplate(template)}
                  >
                    {busy === template.id ? "Saving…" : "Save template"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="border-t border-slate-100 p-4 sm:p-5">
        <div className="rounded-2xl bg-slate-50 p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <PlusIcon className="h-4 w-4" /> Add a template
          </h3>
          <div className="mt-3 space-y-3">
            <Field label="Template name">
              {(id) => (
                <Input
                  id={id}
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  placeholder="e.g. Day-before reminder"
                />
              )}
            </Field>
            <Field label="Message">
              {(id) => (
                <Textarea
                  id={id}
                  rows={6}
                  value={newBody}
                  onChange={(event) => setNewBody(event.target.value)}
                  placeholder="Hi {{guest_name}}…"
                />
              )}
            </Field>
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="primary"
                disabled={busy !== null}
                onClick={() => void addTemplate()}
              >
                {busy === "new" ? "Adding…" : "Add template"}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {error || notice ? (
        <div className="border-t border-slate-100 p-4 sm:p-5">
          {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
          {notice ? <p role="status" className="text-sm text-emerald-700">{notice}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
