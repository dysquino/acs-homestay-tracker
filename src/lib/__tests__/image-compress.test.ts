import { describe, expect, it } from "vitest";

import {
  computeTargetDimensions,
  MAX_EDGE_PX,
  pickOutputMime,
} from "../image-compress";

describe("computeTargetDimensions", () => {
  it("scales the long edge to maxEdge while preserving aspect ratio", () => {
    const out = computeTargetDimensions(4000, 3000, 1600);
    expect(out).toEqual({ width: 1600, height: 1200 });
  });

  it("scales correctly when height is the long edge (portrait)", () => {
    const out = computeTargetDimensions(1080, 2400, 1600);
    expect(out).toEqual({ width: 720, height: 1600 });
  });

  it("does not upscale small images", () => {
    const out = computeTargetDimensions(800, 600, 1600);
    expect(out).toEqual({ width: 800, height: 600 });
  });

  it("does not change a square image that's exactly at the cap", () => {
    const out = computeTargetDimensions(1600, 1600, 1600);
    expect(out).toEqual({ width: 1600, height: 1600 });
  });

  it("defaults the cap to MAX_EDGE_PX (1600)", () => {
    const out = computeTargetDimensions(3000, 2000);
    expect(out).toEqual({ width: 1600, height: 1067 });
    expect(MAX_EDGE_PX).toBe(1600);
  });

  it("handles degenerate input by passing it through", () => {
    expect(computeTargetDimensions(0, 0, 1600)).toEqual({ width: 0, height: 0 });
    expect(computeTargetDimensions(NaN, 100, 1600)).toEqual({ width: NaN, height: 100 });
  });
});

describe("pickOutputMime", () => {
  it("always returns image/jpeg", () => {
    expect(pickOutputMime("image/jpeg")).toBe("image/jpeg");
    expect(pickOutputMime("image/png")).toBe("image/jpeg");
    expect(pickOutputMime("image/webp")).toBe("image/jpeg");
    expect(pickOutputMime("image/heic")).toBe("image/jpeg");
  });
});
