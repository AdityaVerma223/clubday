import { describe, expect, it } from "vitest";
import { createCheckinCode, createCheckinToken, verifyCheckinCode, verifyCheckinToken } from "@/lib/checkin-token";

const secret = "test-only-checkin-secret";

describe("time-limited check-in QR token", () => {
  it("accepts a valid token before its 60 second lifetime ends", () => {
    const token = createCheckinToken("activity-1", secret, 0);
    expect(verifyCheckinToken(token, "activity-1", secret, 59_999)).toBe(true);
  });

  it("rejects expired, tampered, wrong-activity, and future tokens", () => {
    const token = createCheckinToken("activity-1", secret, 0);
    expect(verifyCheckinToken(token, "activity-1", secret, 60_000)).toBe(false);
    expect(verifyCheckinToken(`${token}x`, "activity-1", secret, 20_000)).toBe(false);
    expect(verifyCheckinToken(token, "activity-2", secret, 20_000)).toBe(false);
    expect(verifyCheckinToken(createCheckinToken("activity-1", secret, 60_000), "activity-1", secret, 59_999)).toBe(false);
  });

  it("uses a matching six digit fallback code for the same minute only", () => {
    const code = createCheckinCode("activity-1", secret, 0);
    expect(verifyCheckinCode(code, "activity-1", secret, 59_999)).toBe(true);
    expect(verifyCheckinCode(code, "activity-1", secret, 60_000)).toBe(false);
    expect(verifyCheckinCode(code, "activity-2", secret, 20_000)).toBe(false);
  });
});
