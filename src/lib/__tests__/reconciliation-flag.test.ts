import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  isReconciliationEnabled,
  reconciliationEnabledForClient,
  requireReconciliationEnabled,
} from "../reconciliation-flag";

const original = process.env.RECONCILIATION_ENABLED;

beforeEach(() => {
  delete process.env.RECONCILIATION_ENABLED;
});

afterEach(() => {
  if (original === undefined) delete process.env.RECONCILIATION_ENABLED;
  else process.env.RECONCILIATION_ENABLED = original;
});

describe("isReconciliationEnabled", () => {
  it("is off when the variable is absent", () => {
    // Fail closed: an audit feature must not be reachable by accident just
    // because an env var went missing.
    expect(isReconciliationEnabled()).toBe(false);
  });

  it("is on only for an explicit true", () => {
    process.env.RECONCILIATION_ENABLED = "true";
    expect(isReconciliationEnabled()).toBe(true);
  });

  it("tolerates case and surrounding whitespace", () => {
    process.env.RECONCILIATION_ENABLED = " TRUE ";
    expect(isReconciliationEnabled()).toBe(true);
  });

  it("treats anything else as off", () => {
    // "false", "1", "yes" and typos must not switch an audit feature on.
    for (const value of ["false", "0", "1", "yes", "on", "enabled", "tru", ""]) {
      process.env.RECONCILIATION_ENABLED = value;
      expect(isReconciliationEnabled(), value).toBe(false);
    }
  });

  it("re-reads the variable each call, so a toggle takes effect without restart", () => {
    process.env.RECONCILIATION_ENABLED = "false";
    expect(isReconciliationEnabled()).toBe(false);
    process.env.RECONCILIATION_ENABLED = "true";
    expect(isReconciliationEnabled()).toBe(true);
  });
});

describe("requireReconciliationEnabled", () => {
  it("passes when the feature is on", () => {
    process.env.RECONCILIATION_ENABLED = "true";
    expect(() => requireReconciliationEnabled()).not.toThrow();
  });

  it("throws when the feature is off, so no write can land", () => {
    expect(() => requireReconciliationEnabled()).toThrow(/disabled/i);
    process.env.RECONCILIATION_ENABLED = "false";
    expect(() => requireReconciliationEnabled()).toThrow(/disabled/i);
  });
});

describe("reconciliationEnabledForClient", () => {
  it("mirrors the server value as a plain boolean", () => {
    process.env.RECONCILIATION_ENABLED = "true";
    expect(reconciliationEnabledForClient()).toBe(true);
    process.env.RECONCILIATION_ENABLED = "false";
    expect(reconciliationEnabledForClient()).toBe(false);
  });
});