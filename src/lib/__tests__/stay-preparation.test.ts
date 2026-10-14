import { describe, expect, it } from "vitest";

import {
  messageVariables,
  renderGuestMessage,
  suggestDoorPasscode,
} from "../stay-preparation";
import type { Booking } from "../types";

const booking: Booking = {
  id: "booking-1",
  guestName: "Mika",
  source: "direct",
  checkIn: "2026-10-20",
  checkOut: "2026-10-23",
  guestsCount: 2,
  totalPayout: 5000,
  platformFee: 0,
  paymentStatus: "paid",
  contactInfo: "",
  notes: "",
  createdBy: "Owner",
  confirmationCode: null,
  hasPaymentScreenshot: false,
  paymentScreenshotMime: null,
  hasIdPhoto: false,
  idPhotoMime: null,
};

describe("guest message templates", () => {
  it("renders every supported variable for a booking", () => {
    const variables = messageVariables(
      booking,
      "ACs WiFi",
      "island-wifi",
      "4821",
      "2:00 PM",
      "11:00 AM",
      "The ACs",
    );
    expect(
      renderGuestMessage(
        "Hi {{guest_name}} | {{check_in_time}} {{check_in}} | {{check_out_time}} {{check_out}} | {{wifi_name}} | {{wifi_password}} | {{door_passcode}} | {{host_signature}}",
        variables,
      ),
    ).toBe("Hi Mika | 2:00 PM Oct 20, 2026 | 11:00 AM Oct 23, 2026 | ACs WiFi | island-wifi | 4821 | The ACs");
  });

  it("shows useful prompts when stay details have not been added", () => {
    const variables = messageVariables(booking, "", "", "", "", "", "");
    expect(renderGuestMessage("{{check_in_time}} / {{check_out_time}} / {{wifi_name}} / {{wifi_password}} / {{door_passcode}} / {{host_signature}}", variables)).toBe(
      "[add check-in time] / [add check-out time] / [add Wi-Fi name] / [add Wi-Fi password] / [add door passcode] / [add host signature]",
    );
  });

  it("leaves unknown variables visible instead of silently deleting them", () => {
    const variables = messageVariables(booking, "ACs WiFi", "wifi", "1234", "2:00 PM", "11:00 AM", "The ACs");
    expect(renderGuestMessage("{{guest_name}} {{unknown_value}}", variables)).toBe(
      "Mika {{unknown_value}}",
    );
  });

  it("suggests a stable seven-digit code with a trailing hash", () => {
    const suggestion = suggestDoorPasscode({ ...booking, contactInfo: "+63 917 123 4567" });
    expect(suggestion).toMatch(/^000\d{4}#$/);
    expect(suggestDoorPasscode({ ...booking, contactInfo: "+63 917 123 4567" })).toBe(suggestion);
    expect(suggestDoorPasscode({ ...booking, checkIn: "2026-10-21" })).not.toBe(suggestion);
  });
});
