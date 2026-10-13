import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  envReconciliationOverride,
  isReconciliationEnabled,
  reconciliationEnabledForClient,
} from "../reconciliation-flag";

const original = process.env.RECONCILIATION_ENABLED;

beforeEach(() => {
  delete process.env.RECONCILIATION_ENABLED;
});

afterEach(() => {
  if (original === undefined) delete process.env.RECONCILIATION_ENABLED;
  else process.env.RECONCILIATION_ENABLED = original;
});

describe("envReconciliationOverride", () => {
  it("is null when the variable is absent, so the DB row decides", () => {
    expect(envReconciliationOverride()).toBeNull();
  });

  it("reports an explicit env value in either direction", () => {
    process.env.RECONCILIATION_ENABLED = "true";
    expect(envReconciliationOverride()).toBe(true);
    process.env.RECONCILIATION_ENABLED = "false";
    expect(envReconciliationOverride()).toBe(false);
  });
});

describe("isReconciliationEnabled", () => {
  it("follows the stored row when the env var is unset", () => {
    expect(isReconciliationEnabled(true)).toBe(true);
    expect(isReconciliationEnabled(false)).toBe(false);
  });

  it("is off when there is no stored row yet", () => {
    // A missing config row must not leave an audit feature reachable.
    expect(isReconciliationEnabled(null)).toBe(false);
    expect(isReconciliationEnabled(undefined)).toBe(false);
  });

  it("lets the env var force it off, overriding a stored on", () => {
    // The panic button: no deploy, no database edit, feature off everywhere.
    process.env.RECONCILIATION_ENABLED = "false";
    expect(isReconciliationEnabled(true)).toBe(false);
  });

  it("lets the env var force it on, overriding a stored off", () => {
    process.env.RECONCILIATION_ENABLED = "true";
    expect(isReconciliationEnabled(false)).toBe(true);
  });

  it("treats any non-'true' env value as off, never as truthy", () => {
    for (const value of ["0", "1", "yes", "on", "enabled", "tru", ""]) {
      process.env.RECONCILIATION_ENABLED = value;
      expect(isReconciliationEnabled(true), value).toBe(false);
    }
  });

  it("tolerates case and whitespace in the env value", () => {
    process.env.RECONCILIATION_ENABLED = " TRUE ";
    expect(isReconciliationEnabled(false)).toBe(true);
  });

  it("re-reads the variable each call, so a toggle takes effect without restart", () => {
    process.env.RECONCILIATION_ENABLED = "false";
    expect(isReconciliationEnabled(true)).toBe(false);
    process.env.RECONCILIATION_ENABLED = "true";
    expect(isReconciliationEnabled(false)).toBe(true);
  });
});

describe("reconciliationEnabledForClient", () => {
  it("mirrors the server's resolution as a plain boolean", () => {
    expect(reconciliationEnabledForClient(true)).toBe(true);
    expect(reconciliationEnabledForClient(false)).toBe(false);
    process.env.RECONCILIATION_ENABLED = "false";
    expect(reconciliationEnabledForClient(true)).toBe(false);
  });
});