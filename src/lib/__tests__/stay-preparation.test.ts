import { describe, expect, it } from "vitest";

import {
  messageVariables,
  renderGuestMessage,
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
    const variables = messageVariables(booking, "island-wifi", "4821");
    expect(
      renderGuestMessage(
        "Hi {{guest_name}} | {{check_in}} | {{check_out}} | {{wifi_password}} | {{door_passcode}}",
        variables,
      ),
    ).toBe("Hi Mika | Oct 20, 2026 | Oct 23, 2026 | island-wifi | 4821");
  });

  it("shows useful prompts when stay details have not been added", () => {
    const variables = messageVariables(booking, "", "");
    expect(renderGuestMessage("{{wifi_password}} / {{door_passcode}}", variables)).toBe(
      "[add Wi-Fi password] / [add door passcode]",
    );
  });

  it("leaves unknown variables visible instead of silently deleting them", () => {
    const variables = messageVariables(booking, "wifi", "1234");
    expect(renderGuestMessage("{{guest_name}} {{unknown_value}}", variables)).toBe(
      "Mika {{unknown_value}}",
    );
  });
});
