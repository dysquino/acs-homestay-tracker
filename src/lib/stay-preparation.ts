import { formatDate } from "./format";
import type { Booking } from "./types";

export const MESSAGE_VARIABLES = [
  "guest_name",
  "check_in",
  "check_in_time",
  "check_out",
  "check_out_time",
  "wifi_name",
  "wifi_password",
  "door_passcode",
] as const;

export type MessageVariable = (typeof MESSAGE_VARIABLES)[number];

export type GuestMessageTemplate = {
  id: string;
  name: string;
  body: string;
  sortOrder: number;
};

export type StayPreparationData = {
  doorPasscodes: Record<string, string>;
  wifiName: string;
  wifiPassword: string;
  checkInTime: string;
  checkOutTime: string;
  templates: GuestMessageTemplate[];
};

export type MessageVariables = Record<MessageVariable, string>;

export function messageVariables(
  booking: Booking,
  wifiName: string,
  wifiPassword: string,
  doorPasscode: string,
  checkInTime: string,
  checkOutTime: string,
): MessageVariables {
  return {
    guest_name: booking.guestName,
    check_in: formatDate(booking.checkIn),
    check_in_time: checkInTime || "[add check-in time]",
    check_out: formatDate(booking.checkOut),
    check_out_time: checkOutTime || "[add check-out time]",
    wifi_name: wifiName || "[add Wi-Fi name]",
    wifi_password: wifiPassword || "[add Wi-Fi password]",
    door_passcode: doorPasscode || "[add door passcode]",
  };
}

/**
 * A repeatable, random-looking seven-digit door code for a stay. The four
 * variable digits are derived from the guest's contact details and check-in
 * date, so reopening the same booking suggests the same code without storing
 * it until the owner explicitly saves it.
 */
export function suggestDoorPasscode(booking: Booking): string {
  const seed = `${booking.contactInfo.trim()}|${booking.checkIn}|${booking.id}`;
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `000${String(hash >>> 0).slice(-4).padStart(4, "0")}#`;
}

export function renderGuestMessage(body: string, variables: MessageVariables): string {
  return body.replace(/{{\s*([a-z_]+)\s*}}/gi, (token, name: string) => {
    const key = name.toLowerCase() as MessageVariable;
    return key in variables ? variables[key] : token;
  });
}
