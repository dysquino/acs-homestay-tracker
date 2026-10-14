/**
 * Single lookup for the (entity, kind) → server-action triple that backs
 * `IdPhotoProof` / `PaymentProof`. Both the request-side and booking-side
 * actions have identical shapes, so a 2×2 table is the only abstraction
 * needed. Keeps the components free of switch ladders and ensures the
 * request and booking flows can never drift in their action calls.
 */
import {
  attachBookingIdPhoto,
  attachBookingScreenshot,
  clearBookingIdPhoto,
  clearBookingScreenshot,
  getBookingIdPhoto,
  getBookingScreenshot,
} from "@/lib/data/booking-photos";
import {
  attachBookingRequestIdPhoto,
  clearBookingRequestIdPhoto,
  getBookingRequestIdPhoto,
} from "@/lib/data/id-photo";
import {
  attachBookingRequestScreenshot,
  clearBookingRequestScreenshot,
  getBookingRequestScreenshot,
} from "@/lib/data/payment-screenshot";
import {
  attachBookingPaymentScreenshot,
  clearBookingPaymentScreenshot,
  getBookingPaymentScreenshot,
} from "@/lib/data/booking-payments";

export type EntityKind = "request" | "booking" | "payment";
export type ImageKind = "screenshot" | "idPhoto";

type ImageActions = {
  get: (id: string) => Promise<{ mime: string; bytes: Uint8Array } | null>;
  attach: (
    id: string,
    bytes: Uint8Array,
  ) => Promise<{ mime: string } | { error: string }>;
  clear: (id: string) => Promise<void>;
};

const ACTIONS: Record<EntityKind, Record<ImageKind, ImageActions>> = {
  request: {
    screenshot: {
      get: getBookingRequestScreenshot,
      attach: attachBookingRequestScreenshot,
      clear: clearBookingRequestScreenshot,
    },
    idPhoto: {
      get: getBookingRequestIdPhoto,
      attach: attachBookingRequestIdPhoto,
      clear: clearBookingRequestIdPhoto,
    },
  },
  booking: {
    screenshot: {
      get: getBookingScreenshot,
      attach: attachBookingScreenshot,
      clear: clearBookingScreenshot,
    },
    idPhoto: {
      get: getBookingIdPhoto,
      attach: attachBookingIdPhoto,
      clear: clearBookingIdPhoto,
    },
  },
  payment: {
    screenshot: {
      get: getBookingPaymentScreenshot,
      attach: attachBookingPaymentScreenshot,
      clear: clearBookingPaymentScreenshot,
    },
    // Payment rows never use ID photos. This keeps the lookup type exhaustive;
    // callers can only select `screenshot` for this entity kind.
    idPhoto: {
      get: async () => null,
      attach: async () => ({ error: "ID photos are not supported for payments." }),
      clear: async () => undefined,
    },
  },
};

export function imageActions(entityKind: EntityKind, kind: ImageKind): ImageActions {
  return ACTIONS[entityKind][kind];
}
