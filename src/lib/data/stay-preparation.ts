"use server";

import { prisma } from "@/lib/prisma";
import type {
  GuestMessageTemplate,
  StayPreparationData,
} from "@/lib/stay-preparation";

import { requireSiteAccess } from "./access";

const SETTINGS_ID = "default";
const MAX_SHORT_TEXT = 200;
const MAX_TEMPLATE_BODY = 4000;
const MAX_TEMPLATES = 20;

const DEFAULT_TEMPLATES = [
  {
    id: "arrival-default",
    name: "Arrival details",
    sortOrder: 0,
    body: "Hi {{guest_name}}! We’re looking forward to hosting you. Your check-in is {{check_in}} and check-out is {{check_out}}. The Wi-Fi password is {{wifi_password}}, and your door passcode is {{door_passcode}}. Safe travels!",
  },
  {
    id: "checkout-default",
    name: "Check-out reminder",
    sortOrder: 1,
    body: "Hi {{guest_name}}, just a friendly reminder that check-out is on {{check_out}}. Thank you for staying with us!",
  },
];

function validateText(value: unknown, label: string, max: number, required = false): asserts value is string {
  if (typeof value !== "string") throw new Error(`${label} must be text.`);
  if (required && !value.trim()) throw new Error(`${label} is required.`);
  if (value.length > max) throw new Error(`${label} is too long.`);
}

function templateFromDb(row: {
  id: string;
  name: string;
  body: string;
  sortOrder: number;
}): GuestMessageTemplate {
  return { id: row.id, name: row.name, body: row.body, sortOrder: row.sortOrder };
}

export async function listStayPreparation(): Promise<StayPreparationData> {
  await requireSiteAccess();

  const [settings, preparations, templates] = await prisma.$transaction(async (tx) => {
    let settings = await tx.homestaySettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID },
      update: {},
    });

    if (!settings.messageTemplatesInitialized) {
      await tx.guestMessageTemplate.createMany({ data: DEFAULT_TEMPLATES, skipDuplicates: true });
      settings = await tx.homestaySettings.update({
        where: { id: SETTINGS_ID },
        data: { messageTemplatesInitialized: true },
      });
    }

    const [preparations, templates] = await Promise.all([
      tx.stayPreparation.findMany(),
      tx.guestMessageTemplate.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    ]);
    return [settings, preparations, templates] as const;
  });

  return {
    wifiPassword: settings.wifiPassword,
    doorPasscodes: Object.fromEntries(preparations.map((item) => [item.bookingId, item.doorPasscode])),
    templates: templates.map(templateFromDb),
  };
}

export async function saveDoorPasscode(bookingId: string, doorPasscode: string): Promise<void> {
  await requireSiteAccess();
  validateText(bookingId, "Booking", MAX_SHORT_TEXT, true);
  validateText(doorPasscode, "Door passcode", MAX_SHORT_TEXT);
  await prisma.stayPreparation.upsert({
    where: { bookingId },
    create: { bookingId, doorPasscode: doorPasscode.trim() },
    update: { doorPasscode: doorPasscode.trim() },
  });
}

export async function saveWifiPassword(wifiPassword: string): Promise<void> {
  await requireSiteAccess();
  validateText(wifiPassword, "Wi-Fi password", MAX_SHORT_TEXT);
  await prisma.homestaySettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, wifiPassword: wifiPassword.trim() },
    update: { wifiPassword: wifiPassword.trim() },
  });
}

export async function createGuestMessageTemplate(input: {
  name: string;
  body: string;
}): Promise<GuestMessageTemplate> {
  await requireSiteAccess();
  validateText(input.name, "Template name", MAX_SHORT_TEXT, true);
  validateText(input.body, "Template message", MAX_TEMPLATE_BODY, true);
  const count = await prisma.guestMessageTemplate.count();
  if (count >= MAX_TEMPLATES) throw new Error(`You can keep up to ${MAX_TEMPLATES} templates.`);
  const last = await prisma.guestMessageTemplate.aggregate({ _max: { sortOrder: true } });
  const row = await prisma.guestMessageTemplate.create({
    data: {
      name: input.name.trim(),
      body: input.body.trim(),
      sortOrder: (last._max.sortOrder ?? -1) + 1,
    },
  });
  return templateFromDb(row);
}

export async function updateGuestMessageTemplate(
  id: string,
  input: { name: string; body: string },
): Promise<GuestMessageTemplate> {
  await requireSiteAccess();
  validateText(id, "Template", MAX_SHORT_TEXT, true);
  validateText(input.name, "Template name", MAX_SHORT_TEXT, true);
  validateText(input.body, "Template message", MAX_TEMPLATE_BODY, true);
  const row = await prisma.guestMessageTemplate.update({
    where: { id },
    data: { name: input.name.trim(), body: input.body.trim() },
  });
  return templateFromDb(row);
}

export async function deleteGuestMessageTemplate(id: string): Promise<void> {
  await requireSiteAccess();
  validateText(id, "Template", MAX_SHORT_TEXT, true);
  await prisma.guestMessageTemplate.delete({ where: { id } });
}
