import { describe, expect, it } from "vitest";

import { csvResponse, toCsv } from "../csv";

describe("toCsv", () => {
  it("joins headers and rows with commas and CRLF", () => {
    expect(toCsv(["A", "B"], [["x", 1]])).toBe('﻿A,B\r\nx,1\r\n');
  });

  it("quotes a field containing a comma, a quote, or a newline — and nothing else", () => {
    expect(toCsv(["H"], [["a,b"]])).toContain('"a,b"');
    expect(toCsv(["H"], [['say "hi"']])).toContain('"say ""hi"""');
    expect(toCsv(["H"], [["line1\nline2"]])).toContain('"line1\nline2"');
    expect(toCsv(["H"], [["plain"]])).toContain("plain");
    expect(toCsv(["H"], [["plain"]])).not.toContain('"plain"');
  });

  it("renders numbers without quoting or reformatting", () => {
    expect(toCsv(["Amount"], [[1234.5]])).toContain("1234.5");
  });

  it("produces the same number of lines as rows, plus a header", () => {
    const csv = toCsv(["A"], [["1"], ["2"], ["3"]]);
    const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
    expect(lines).toHaveLength(4);
  });

  it("starts with a BOM so Excel reads UTF-8 correctly", () => {
    expect(toCsv(["H"], [["₱"]]).charCodeAt(0)).toBe(0xfeff);
  });
});

describe("csvResponse", () => {
  it("sets a CSV content type and a download filename", () => {
    const res = csvResponse("test.csv", "a,b\r\n1,2\r\n");
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="test.csv"');
  });
});
