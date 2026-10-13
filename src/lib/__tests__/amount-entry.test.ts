import { describe, expect, it } from "vitest";

import {
  applyKey,
  centsToDigits,
  EMPTY_ENTRY,
  entryToAmount,
  exactCandidates,
  formatEntry,
  hasAmount,
  keyFromKeyboard,
  type AmountEntry,
} from "../amount-entry";

const press = (entry: AmountEntry, ...keys: Parameters<typeof applyKey>[1][]): AmountEntry =>
  keys.reduce(applyKey, entry);
const digit = (d: string) => ({ type: "digit", digit: d }) as const;
const dot = { type: "dot" } as const;
const backspace = { type: "backspace" } as const;
const clear = { type: "clear" } as const;
const toggle = { type: "toggle-sign" } as const;

describe("typing digits", () => {
  it("builds a figure", () => {
    expect(press(EMPTY_ENTRY, digit("8"), digit("5"), digit("0"), digit("0")).digits).toBe("8500");
  });

  it("doesn't grow a lone zero", () => {
    expect(press(EMPTY_ENTRY, digit("0")).digits).toBe("0");
    expect(press(EMPTY_ENTRY, digit("0"), digit("0")).digits).toBe("0");
  });

  it("replaces a leading zero with the first real digit", () => {
    expect(press(EMPTY_ENTRY, digit("0"), digit("5")).digits).toBe("5");
  });

  it("stops at ten whole digits", () => {
    const long = press(EMPTY_ENTRY, ...Array.from({ length: 12 }, () => digit("9")));
    expect(long.digits).toHaveLength(10);
  });
});

describe("the decimal point", () => {
  it("is accepted once", () => {
    expect(press(EMPTY_ENTRY, digit("8"), dot, digit("5")).digits).toBe("8.5");
  });

  it("is ignored the second time", () => {
    // Two dots would make the string unparseable, and silently keeping the
    // first is the least surprising outcome.
    expect(press(EMPTY_ENTRY, digit("8"), dot, dot, digit("5")).digits).toBe("8.5");
  });

  it("reads as zero when typed first", () => {
    expect(press(EMPTY_ENTRY, dot).digits).toBe("0.");
    expect(entryToAmount(press(EMPTY_ENTRY, dot, digit("5")))).toBe(0.5);
  });
});

describe("two-decimal ceiling", () => {
  it("accepts two decimals", () => {
    expect(press(EMPTY_ENTRY, digit("8"), digit("5"), dot, digit("5"), digit("0")).digits).toBe("85.50");
  });

  it("refuses a third rather than rounding it", () => {
    // ₱85.505 would have to become either 85.50 or 85.51 depending on the
    // caller — the centavo drift the whole feature is built to avoid.
    const entry = press(EMPTY_ENTRY, digit("8"), digit("5"), dot, digit("5"), digit("0"), digit("5"));
    expect(entry.digits).toBe("85.50");
    expect(entryToAmount(entry)).toBe(85.5);
  });
});

describe("the sign", () => {
  it("toggles rather than stacking", () => {
    const entry = press(EMPTY_ENTRY, digit("5"), toggle);
    expect(entry.negative).toBe(true);
    expect(press(entry, toggle).negative).toBe(false);
  });

  it("is refused on an empty field", () => {
    // Otherwise the panel shows "-₱0", implying a negative amount nobody typed.
    expect(press(EMPTY_ENTRY, toggle)).toEqual(EMPTY_ENTRY);
  });

  it("survives backspacing down to nothing", () => {
    const entry = press(EMPTY_ENTRY, digit("5"), digit("0"), toggle, backspace, backspace);
    expect(entry.digits).toBe("");
    expect(entry.negative).toBe(true);
  });
});

describe("backspace and clear", () => {
  it("removes the last character", () => {
    expect(press(EMPTY_ENTRY, digit("1"), digit("2"), digit("3"), backspace).digits).toBe("12");
  });

  it("is a no-op on an empty field", () => {
    expect(applyKey(EMPTY_ENTRY, backspace)).toEqual(EMPTY_ENTRY);
  });

  it("clear resets everything, sign included", () => {
    expect(press(EMPTY_ENTRY, digit("5"), toggle, clear)).toEqual(EMPTY_ENTRY);
  });
});

describe("keyboard mapping", () => {
  it("maps digits, dot, backspace, escape and minus", () => {
    expect(keyFromKeyboard("7")).toEqual(digit("7"));
    expect(keyFromKeyboard(".")).toEqual(dot);
    expect(keyFromKeyboard(",")).toEqual(dot);
    expect(keyFromKeyboard("Backspace")).toEqual(backspace);
    expect(keyFromKeyboard("Escape")).toEqual(clear);
    expect(keyFromKeyboard("-")).toEqual(toggle);
  });

  it("ignores keys that aren't amount input", () => {
    for (const key of ["a", "Enter", "Tab", "ArrowLeft", " "]) {
      expect(keyFromKeyboard(key), key).toBeNull();
    }
  });
});

describe("parsing and display", () => {
  it("is null when nothing usable is entered", () => {
    expect(entryToAmount(EMPTY_ENTRY)).toBeNull();
    expect(hasAmount(EMPTY_ENTRY)).toBe(false);
  });

  it("reads a plain figure", () => {
    expect(entryToAmount({ digits: "8500", negative: false })).toBe(8500);
    expect(entryToAmount({ digits: "85.50", negative: false })).toBe(85.5);
  });

  it("applies the sign", () => {
    expect(entryToAmount({ digits: "250", negative: true })).toBe(-250);
  });

  it("groups thousands and shows the peso sign", () => {
    expect(formatEntry({ digits: "8500", negative: false })).toBe("₱8,500");
    expect(formatEntry({ digits: "8500.5", negative: false })).toBe("₱8,500.5");
  });

  it("uses a true minus sign for negatives", () => {
    expect(formatEntry({ digits: "250", negative: true })).toBe("−₱250");
  });

  it("is empty when nothing is entered", () => {
    expect(formatEntry(EMPTY_ENTRY)).toBe("");
  });
});

describe("centsToDigits", () => {
  it("drops a trailing .00, the way a statement reads", () => {
    expect(centsToDigits(8500)).toBe("8500");
    expect(centsToDigits(1200.5)).toBe("1200.50");
  });

  it("drops a leading zero so a sub-peso figure is still parseable", () => {
    // ".50" rather than "0.50" — the keypad rejects a second decimal and
    // expects the dot-first form.
    expect(centsToDigits(0.5)).toBe(".50");
    expect(entryToAmount({ digits: centsToDigits(0.5), negative: false })).toBe(0.5);
  });

  it("round-trips through the keypad", () => {
    for (const amount of [8500, 1200.5, 0.5, 249.99]) {
      expect(entryToAmount({ digits: centsToDigits(amount), negative: false })).toBeCloseTo(
        amount,
        2,
      );
    }
  });
});

describe("exactCandidates", () => {
  const pool = [
    { id: "a", amount: 8500 },
    { id: "b", amount: 8500 },
    { id: "c", amount: 8499.99 },
    { id: "d", amount: 1200.5 },
  ];

  it("returns every exact match, leaving the choice to the owner", () => {
    // Two receipts for the same amount is normal — picking one for them would
    // be a guess, and §7.7 requires the owner to select.
    expect(exactCandidates(pool, { digits: "8500", negative: false }).map((i) => i.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("compares in centavos, so one peso off is not a match", () => {
    expect(exactCandidates(pool, { digits: "8500", negative: false }).map((i) => i.id)).not.toContain("c");
  });

  it("matches across trailing zeros", () => {
    expect(exactCandidates(pool, { digits: "1200.50", negative: false }).map((i) => i.id)).toEqual(["d"]);
  });

  it("is empty when nothing is typed", () => {
    expect(exactCandidates(pool, EMPTY_ENTRY)).toEqual([]);
  });

  it("is empty when nothing matches", () => {
    expect(exactCandidates(pool, { digits: "999", negative: false })).toEqual([]);
  });

  it("matches an outflow typed negative, since the sign picks the pool", () => {
    // The bug this guards: comparing signed values would mean a negative entry
    // could never equal a positively-stored outflow, so outflow matching would
    // silently never suggest anything.
    const outflows = [{ id: "z", amount: 250 }];
    expect(exactCandidates(outflows, { digits: "250", negative: true }).map((i) => i.id)).toEqual(["z"]);
    expect(exactCandidates(outflows, { digits: "250", negative: false }).map((i) => i.id)).toEqual(["z"]);
  });

  it("still requires an exact figure, whatever the sign", () => {
    const outflows = [{ id: "z", amount: 250 }];
    expect(exactCandidates(outflows, { digits: "251", negative: true })).toEqual([]);
  });
});