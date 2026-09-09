import { describe, expect, it } from "vitest";
import {
  exposureBucketFromUtilization,
  utilizationPct,
} from "@/lib/dashboardConstants";

describe("utilizationPct", () => {
  it("returns committed as a percentage of capacity", () => {
    expect(utilizationPct(20, 40)).toBe(50);
    expect(utilizationPct(40, 40)).toBe(100);
  });

  it("returns over 100 when committed exceeds capacity", () => {
    expect(utilizationPct(60, 40)).toBe(150);
  });

  // The bug this helper exists to fix: the dashboard rendered "NaN%" for a team
  // with no confirmed hours, which is a real state during onboarding.
  it("returns 0 rather than NaN when capacity is zero", () => {
    expect(utilizationPct(10, 0)).toBe(0);
    expect(utilizationPct(0, 0)).toBe(0);
  });

  it("returns 0 for negative or non-finite capacity", () => {
    expect(utilizationPct(10, -5)).toBe(0);
    expect(utilizationPct(10, Number.NaN)).toBe(0);
  });

  it("feeds exposureBucketFromUtilization without producing NaN buckets", () => {
    expect(exposureBucketFromUtilization(utilizationPct(10, 0))).toBe("low");
    // Buckets are <80 low, 80-90 medium, >90 high.
    expect(exposureBucketFromUtilization(utilizationPct(34, 40))).toBe("medium"); // 85%
    expect(exposureBucketFromUtilization(utilizationPct(38, 40))).toBe("high"); // 95%
  });
});
