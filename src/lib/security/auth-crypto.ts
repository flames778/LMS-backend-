import crypto from "crypto";

export function generateSecureToken(byteLength = 32): string {
  return crypto.randomBytes(byteLength).toString("hex");
}

export function generateOidcNonce(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export function generateOidcState(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export function timingSafeEqualString(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}
