import { formatDate } from "./format";
import type { Booking } from "./types";

export const MESSAGE_VARIABLES = [
  "guest_name",
  "check_in",
  "check_out",
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
  wifiPassword: string;
  templates: GuestMessageTemplate[];
};

export type MessageVariables = Record<MessageVariable, string>;

export function messageVariables(
  booking: Booking,
  wifiPassword: string,
  doorPasscode: string,
): MessageVariables {
  return {
    guest_name: booking.guestName,
    check_in: formatDate(booking.checkIn),
    check_out: formatDate(booking.checkOut),
    wifi_password: wifiPassword || "[add Wi-Fi password]",
    door_passcode: doorPasscode || "[add door passcode]",
  };
}

export function renderGuestMessage(body: string, variables: MessageVariables): string {
  return body.replace(/{{\s*([a-z_]+)\s*}}/gi, (token, name: string) => {
    const key = name.toLowerCase() as MessageVariable;
    return key in variables ? variables[key] : token;
  });
}
