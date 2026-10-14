import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_LIFETIME_MS = 60_000;

function signature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createCheckinToken(activityId: string, secret: string, now = Date.now()) {
  const minute = Math.floor(now / TOKEN_LIFETIME_MS) * TOKEN_LIFETIME_MS;
  const payload = `${activityId}.${minute}`;
  return `${payload}.${signature(payload, secret)}`;
}

export function verifyCheckinToken(
  token: string,
  activityId: string,
  secret: string,
  now = Date.now(),
) {
  const [tokenActivityId, issuedAtText, receivedSignature, ...extra] = token.split(".");
  if (extra.length || tokenActivityId !== activityId || !/^\d+$/.test(issuedAtText ?? "")) return false;

  const issuedAt = Number(issuedAtText);
  const age = now - issuedAt;
  if (!Number.isSafeInteger(issuedAt) || age < 0 || age >= TOKEN_LIFETIME_MS) return false;

  const payload = `${tokenActivityId}.${issuedAtText}`;
  const expected = Buffer.from(signature(payload, secret));
  const received = Buffer.from(receivedSignature ?? "");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function createCheckinCode(activityId: string, secret: string, now = Date.now()) {
  const minute = Math.floor(now / TOKEN_LIFETIME_MS) * TOKEN_LIFETIME_MS;
  const digest = createHmac("sha256", secret).update(`code:${activityId}.${minute}`).digest();
  const number = digest.readUInt32BE(0) % 1_000_000;
  return String(number).padStart(6, "0");
}

export function verifyCheckinCode(code: string, activityId: string, secret: string, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return false;
  const expected = Buffer.from(createCheckinCode(activityId, secret, now));
  const received = Buffer.from(code);
  return timingSafeEqual(expected, received);
}

export const CHECKIN_TOKEN_LIFETIME_MS = TOKEN_LIFETIME_MS;
