import { describe, expect, it } from "vitest";
import {
  activeAvailabilityStatus,
  defaultAvailabilityStatus,
  hasAvailabilityConflict,
  isAvailabilityStatusAllowed,
  isMemberEligibleForLineup,
  normalizeAvailabilityMode,
  type AvailabilityMode,
  type AvailabilityStatus,
} from "@/lib/availability";

describe("availability workflow", () => {
  it("normalizes current, legacy and invalid modes", () => {
    expect(normalizeAvailabilityMode("available_only")).toBe("available_only");
    expect(normalizeAvailabilityMode("availability")).toBe("available_only");
    expect(normalizeAvailabilityMode("unavailability")).toBe("unavailable_only");
    expect(normalizeAvailabilityMode("something-else")).toBe("both");
    expect(normalizeAvailabilityMode(null)).toBe("both");
  });

  it.each<[AvailabilityMode, AvailabilityStatus]>([
    ["available_only", "available"],
    ["unavailable_only", "unavailable"],
    ["both", "available"],
  ])("uses the correct default status for %s", (mode, expected) => {
    expect(defaultAvailabilityStatus(mode)).toBe(expected);
  });

  it("ignores statuses disabled by the active workflow", () => {
    expect(isAvailabilityStatusAllowed("available_only", "unavailable")).toBe(false);
    expect(isAvailabilityStatusAllowed("unavailable_only", "available")).toBe(false);
    expect(isAvailabilityStatusAllowed("both", "available")).toBe(true);
    expect(isAvailabilityStatusAllowed("both", "unavailable")).toBe(true);
    expect(activeAvailabilityStatus("available_only", "unavailable")).toBeUndefined();
  });

  it.each<[AvailabilityMode, AvailabilityStatus | undefined, boolean]>([
    ["available_only", "available", false],
    ["available_only", "unavailable", true],
    ["available_only", undefined, true],
    ["unavailable_only", "unavailable", true],
    ["unavailable_only", "available", false],
    ["unavailable_only", undefined, false],
    ["both", "available", false],
    ["both", "unavailable", true],
    ["both", undefined, true],
  ])("computes conflicts for %s / %s", (mode, status, expected) => {
    expect(hasAvailabilityConflict(mode, status)).toBe(expected);
  });

  it.each<[AvailabilityMode, AvailabilityStatus | undefined, boolean, boolean]>([
    ["available_only", "available", true, true],
    ["available_only", undefined, true, false],
    ["available_only", undefined, false, true],
    ["unavailable_only", "unavailable", false, false],
    ["unavailable_only", undefined, false, true],
    ["both", "unavailable", false, false],
    ["both", "available", true, true],
    ["both", undefined, true, false],
    ["both", undefined, false, true],
  ])(
    "computes lineup eligibility for %s / %s with positives=%s",
    (mode, status, hasPositiveResponses, expected) => {
      expect(isMemberEligibleForLineup(mode, status, hasPositiveResponses)).toBe(expected);
    },
  );
});
