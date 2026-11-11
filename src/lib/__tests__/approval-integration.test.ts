import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import {
  approveBookingRequestWithPayment,
  type ApproveWithPaymentInput,
  type DecideResult,
} from "../data/booking-requests";

/**
 * Integration tests for the approval-with-payment flow.
 *
 * The guarantees here are enforced by Postgres, not by application code — one
 * transaction writes the booking, the receipt and the request's new status,
 * and the booking's cached payment status is derived from the receipt that
 * was just written (§12.1). A unit test with a mocked client can't see any
 * of that.
 *
 * They need a real database, so they skip cleanly when `DATABASE_URL` is
 * absent and a fresh clone isn't forced to have one. Run them with:
 *
 *     npx dotenv -e .env.local -- npx vitest run approval-integration
 *
 * ## Safety
 *
 * Everything happens inside one far-future window (`2099-03`) that no real
 * booking will ever reach, and the guest names are prefixed so a leftover row
 * is obvious. Every row created is recorded by id and deleted in `afterAll`,
 * which runs even when a test fails.
 *
 * The month is also asserted empty before the suite starts. If a previous run
 * was interrupted and left rows behind, that is a real finding and the suite
 * refuses to proceed rather than compounding it.
 */

const HAS_DATABASE = Boolean(process.env.DATABASE_URL);
const TEST_MONTH = "2099-03";
const ACTOR = "Integration test";

const prisma = HAS_DATABASE ? new PrismaClient() : null;

function makeClient() {
  if (!prisma) throw new Error("No database client — this suite should have been skipped.");
  return prisma;
}

const created = {
  requests: [] as string[],
  bookings: [] as string[],
};

/** A one-pixel PNG — the smallest thing that passes the magic-byte sniff. */
const TINY_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

async function cleanup() {
  const db = makeClient();
  // Payments and cleanings first — both hang off the booking.
  await db.bookingPayment.deleteMany({ where: { bookingId: { in: created.bookings } } });
  await db.cleaningSchedule.deleteMany({ where: { bookingId: { in: created.bookings } } });
  await db.booking.deleteMany({ where: { id: { in: created.bookings } } });
  await db.bookingRequest.deleteMany({ where: { id: { in: created.requests } } });
}

/** A pending request in the far-future window, optionally with a guest screenshot. */
async function makeRequest(withScreenshot: boolean) {
  const db = makeClient();
  const request = await db.bookingRequest.create({
    data: {
      guestName: `Integration test guest ${Date.now()}`,
      contactInfo: "test@example.com",
      checkIn: new Date(`${TEST_MONTH}-01T00:00:00.000Z`),
      checkOut: new Date(`${TEST_MONTH}-04T00:00:00.000Z`),
      guestsCount: 2,
      message: "Please approve me.",
      status: "PENDING",
      paymentScreenshot: withScreenshot ? Buffer.from(TINY_PNG) : null,
      paymentScreenshotMime: withScreenshot ? "image/png" : null,
    },
  });
  created.requests.push(request.id);
  return request;
}

/**
 * Approve and return the booking, failing the test with the server's own
 * message when the approval is refused. Narrows the result union so the
 * caller can read `.booking` without a cast.
 */
async function approveSuccessfully(id: string, input: ApproveWithPaymentInput) {
  const result: DecideResult = await approveBookingRequestWithPayment(id, ACTOR, input);
  if (!result.ok) throw new Error(`Expected the approval to succeed, but it was refused: ${result.error}`);
  if (!result.booking) throw new Error("Expected the approval to return a booking.");
  created.bookings.push(result.booking.id);
  return result.booking;
}

beforeAll(async () => {
  if (!HAS_DATABASE) return;
  const db = makeClient();
  const existing = await db.booking.count({
    where: { checkIn: { gte: new Date(`${TEST_MONTH}-01T00:00:00.000Z`) } },
  });
  if (existing > 0) {
    throw new Error(
      `The ${TEST_MONTH} test window already holds ${existing} booking(s) — a previous run left rows behind. Clean them up before running this suite.`,
    );
  }
});

afterEach(async () => {
  if (!HAS_DATABASE) return;
  await cleanup();
  created.requests.length = 0;
  created.bookings.length = 0;
});

afterAll(async () => {
  if (!HAS_DATABASE) return;
  await cleanup();
  await prisma!.$disconnect();
});

describe.skipIf(!HAS_DATABASE)("approveBookingRequestWithPayment", () => {
  it("creates the booking at the owner's amount, unpaid, with no receipts", async () => {
    const request = await makeRequest(false);

    const booking = await approveSuccessfully(request.id, {
      totalPayout: 5000,
      paymentReceived: false,
    });

    const db = makeClient();
    const row = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });

    expect(Number(row.totalPayout)).toBe(5000);
    expect(row.paymentStatus).toBe("PENDING");
    expect(row.source).toBe("DIRECT");
    expect(await db.bookingPayment.count({ where: { bookingId: booking.id } })).toBe(0);

    // The request is consumed and points at the booking.
    const after = await db.bookingRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(after.status).toBe("APPROVED");
    expect(after.bookingId).toBe(booking.id);

    // The turnover cleaning is scheduled for the check-out date, as with any
    // other direct booking.
    const cleaning = await db.cleaningSchedule.findMany({ where: { bookingId: booking.id } });
    expect(cleaning).toHaveLength(1);
    expect(cleaning[0].date.toISOString().slice(0, 10)).toBe(`${TEST_MONTH}-04`);
  });

  it("records a deposit as a receipt and derives the payment status from it", async () => {
    const request = await makeRequest(false);

    const booking = await approveSuccessfully(request.id, {
      totalPayout: 5000,
      paymentReceived: true,
      amountReceived: 2000,
      receivedDate: "2099-02-28",
      method: "bank_transfer",
      reference: "REF-123",
    });

    const db = makeClient();
    const payments = await db.bookingPayment.findMany({ where: { bookingId: booking.id } });
    expect(payments).toHaveLength(1);
    expect(Number(payments[0].amount)).toBe(2000);
    expect(payments[0].method).toBe("BANK_TRANSFER");
    expect(payments[0].reference).toBe("REF-123");
    expect(payments[0].receivedDate.toISOString().slice(0, 10)).toBe("2099-02-28");
    expect(payments[0].createdBy).toBe(ACTOR);

    // A deposit below the total reads as partial — derived, never hand-set.
    const row = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(row.paymentStatus).toBe("PARTIAL");
  });

  it("reads as paid when the deposit covers the whole amount", async () => {
    const request = await makeRequest(false);

    const booking = await approveSuccessfully(request.id, {
      totalPayout: 5000,
      paymentReceived: true,
      amountReceived: 5000,
      receivedDate: "2099-02-28",
    });

    const db = makeClient();
    const row = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(row.paymentStatus).toBe("PAID");
  });

  it("reuses the guest's own screenshot as the receipt's proof", async () => {
    const request = await makeRequest(true);

    const booking = await approveSuccessfully(request.id, {
      totalPayout: 5000,
      paymentReceived: true,
      amountReceived: 5000,
    });

    const db = makeClient();
    const payment = await db.bookingPayment.findFirstOrThrow({ where: { bookingId: booking.id } });
    expect(payment.paymentScreenshot).not.toBeNull();
    expect(payment.paymentScreenshotMime).toBe("image/png");
    // The same bytes the guest sent are carried onto the booking too.
    const row = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(row.paymentScreenshot).not.toBeNull();
  });

  it("prefers the owner's upload over the guest's screenshot", async () => {
    const request = await makeRequest(true);

    const booking = await approveSuccessfully(request.id, {
      totalPayout: 5000,
      paymentReceived: true,
      amountReceived: 5000,
      paymentScreenshot: TINY_PNG,
    });

    const db = makeClient();
    const payment = await db.bookingPayment.findFirstOrThrow({ where: { bookingId: booking.id } });
    expect(payment.paymentScreenshot).not.toBeNull();
  });

  it("records a receipt without proof when the guest sent none", async () => {
    const request = await makeRequest(false);

    const booking = await approveSuccessfully(request.id, {
      totalPayout: 5000,
      paymentReceived: true,
      amountReceived: 5000,
    });

    const db = makeClient();
    const payment = await db.bookingPayment.findFirstOrThrow({ where: { bookingId: booking.id } });
    expect(payment.paymentScreenshot).toBeNull();
    expect(payment.paymentScreenshotMime).toBeNull();
  });

  it("refuses a deposit of zero", async () => {
    const request = await makeRequest(false);

    const result = await approveBookingRequestWithPayment(request.id, ACTOR, {
      totalPayout: 5000,
      paymentReceived: true,
      amountReceived: 0,
    });

    expect(result.ok).toBe(false);
    const db = makeClient();
    // Nothing was created — the request is still pending.
    expect(
      await db.booking.count({ where: { checkIn: { gte: new Date(`${TEST_MONTH}-01T00:00:00.000Z`) } } }),
    ).toBe(0);
    const after = await db.bookingRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(after.status).toBe("PENDING");
  });

  it("refuses a negative total", async () => {
    const request = await makeRequest(false);

    const result = await approveBookingRequestWithPayment(request.id, ACTOR, {
      totalPayout: -1,
      paymentReceived: false,
    });

    expect(result.ok).toBe(false);
  });

  it("refuses to approve the same request twice", async () => {
    const request = await makeRequest(false);

    await approveSuccessfully(request.id, { totalPayout: 5000, paymentReceived: false });

    const second = await approveBookingRequestWithPayment(request.id, ACTOR, {
      totalPayout: 5000,
      paymentReceived: false,
    });
    expect(second.ok).toBe(false);
  });
});
