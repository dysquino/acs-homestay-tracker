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
const MESSAGE_TEMPLATES_VERSION = 5;

const DEFAULT_TEMPLATES = [
  {
    id: "booking-confirmation-default",
    name: "Booking confirmation and ID request",
    sortOrder: 0,
    body: `Hi {{guest_name}}, thanks for booking with us.

Please send any valid ID for documentation purposes. I'll send your check-in details before your arrival. Check in starts at {{check_in_time}} onwards, and Check out is at {{check_out_time}}. Early Check in/Late Check out is subject for availability.

In the meantime, if you have any questions or need any recommendations, feel free to reach out.
Looking forward to hosting you!

Sincerely,
{{host_signature}}`,
  },
  {
    id: "arrival-default",
    name: "Welcome and house manual",
    sortOrder: 1,
    body: `Hi {{guest_name}}, your stay is coming up soon. You can check in anytime after {{check_in_time}} on {{check_in}}.

Please take time to read our house rules/manual.
ACs Cozy Condo Unit
⸻
Welcome
Thank you for choosing to stay with us! Please follow the guidelines below for a smooth and pleasant stay.
⸻
Check-In / Check-Out
Check-in: {{check_in_time}}
Check-out: {{check_out_time}}
(Early / late requests subject to availability)
⸻
Parking
Free parking is available on a first come, first served basis.
Please use only parking slots that are not privately owned or already sold.
Availability is not guaranteed.
⸻
Wi-Fi
Wi-Fi access is complimentary for your stay.
⸻
Air Conditioning
Turn off when leaving
Keep doors and windows closed while in use
⸻
Bathroom
Do not flush tissue, wipes, or sanitary items
Use the trash bin provided
⸻
Kitchenette
Light cooking only
Wash dishes and wipe surfaces after use
⸻
Trash Disposal
Take all trash to the designated garbage area beside the elevator
Dispose regularly to keep the unit clean
⸻
Pool Use
The swimming pool is located on the 4th floor.
You may freely use the pool with a maximum of 3 guests at a time.

Daily Operating Hours:
9:00 AM – 12:00 NN
2:00 PM – 8:30 PM
⸻
Noise & Conduct
Quiet hours: 10:00 PM – 8:00 AM
No parties, events, or unregistered guests
⸻
House Rules
No smoking
No pets
Respect neighbors and building rules
⸻
Safety
Always lock the door
Turn off appliances when not in use
In emergencies, contact authorities first, then notify the host
⸻
Need Help?
Please message us for any concerns.

Here’s the address:
Unit: 29N15
Floor: 29
Unit Number: N15
JTower Residences, L. Jayme Street, Mandaue, 6014, Central Visayas
https://maps.app.goo.gl/8HHGYX9Yb1up7i1e6

Your passcode for the door lock:
{{door_passcode}}

Here are the wifi details:
Name: {{wifi_name}}
Password: {{wifi_password}}

If you have any questions, we are here to help. Hope you enjoy your stay!

{{host_signature}}`,
  },
  {
    id: "checkout-default",
    name: "Check-out reminder",
    sortOrder: 2,
    body: `Hi {{guest_name}},
I hope you had a great stay!

Check out time is {{check_out_time}} on {{check_out}}. Here are the checkout instructions.

Please let me know if there's anything I can help you with before you go.

Checkout instructions

Gather used towels
Please place all used towels in the bed.

Throw trash away
Please dispose of all trash in the designated bins near the elevators, facing the mountain view. Make sure no trash is left in the unit.

Turn things off
Before leaving, please turn off:
• Lights
• Air conditioning
• Electric fans
• Any appliances used

Lock up
Ensure all doors and windows are properly closed and locked.

Additional requests
If anything was damaged, lost, or needs attention, kindly let us know before check-out. Thank you for helping us keep the space clean and ready for our next guests. Safe travels!

{{host_signature}}`,
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

    if (settings.messageTemplatesVersion < MESSAGE_TEMPLATES_VERSION) {
      const previousTemplateVersion = settings.messageTemplatesVersion;
      await Promise.all(
        DEFAULT_TEMPLATES.map((template) =>
          tx.guestMessageTemplate.upsert({
            where: { id: template.id },
            create: template,
            update: previousTemplateVersion >= 3
              ? { body: template.body, sortOrder: template.sortOrder }
              : { name: template.name, body: template.body, sortOrder: template.sortOrder },
          }),
        ),
      );
      settings = await tx.homestaySettings.update({
        where: { id: SETTINGS_ID },
        data: {
          messageTemplatesInitialized: true,
          messageTemplatesVersion: MESSAGE_TEMPLATES_VERSION,
        },
      });
    }

    const [preparations, templates] = await Promise.all([
      tx.stayPreparation.findMany(),
      tx.guestMessageTemplate.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    ]);
    return [settings, preparations, templates] as const;
  });

  return {
    wifiName: settings.wifiName,
    wifiPassword: settings.wifiPassword,
    checkInTime: settings.checkInTime,
    checkOutTime: settings.checkOutTime,
    hostSignature: settings.hostSignature,
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

export async function saveStayMessageSettings(input: {
  wifiName: string;
  wifiPassword: string;
  checkInTime: string;
  checkOutTime: string;
  hostSignature: string;
}): Promise<void> {
  await requireSiteAccess();
  validateText(input.wifiName, "Wi-Fi name", MAX_SHORT_TEXT);
  validateText(input.wifiPassword, "Wi-Fi password", MAX_SHORT_TEXT);
  validateText(input.checkInTime, "Check-in time", MAX_SHORT_TEXT, true);
  validateText(input.checkOutTime, "Check-out time", MAX_SHORT_TEXT, true);
  validateText(input.hostSignature, "Host signature", MAX_SHORT_TEXT, true);
  await prisma.homestaySettings.upsert({
    where: { id: SETTINGS_ID },
    create: {
      id: SETTINGS_ID,
      wifiName: input.wifiName.trim(),
      wifiPassword: input.wifiPassword.trim(),
      checkInTime: input.checkInTime.trim(),
      checkOutTime: input.checkOutTime.trim(),
      hostSignature: input.hostSignature.trim(),
    },
    update: {
      wifiName: input.wifiName.trim(),
      wifiPassword: input.wifiPassword.trim(),
      checkInTime: input.checkInTime.trim(),
      checkOutTime: input.checkOutTime.trim(),
      hostSignature: input.hostSignature.trim(),
    },
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
