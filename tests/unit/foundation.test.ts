import { describe, it, expect } from "vitest";
import { getEnv } from "@/lib/validation/env";
import { prisma } from "@/lib/database/prisma";
import { generateOidcNonce, generateOidcState, timingSafeEqualString } from "@/lib/security/auth-crypto";
import { createSessionToken, verifySessionToken, SessionPayload } from "@/lib/security/session";
import { LocalStorageProvider } from "@/lib/storage/storage-provider";
import path from "path";

describe("Phase 1: Foundation & Security Tests", () => {
  it("should validate required environment variables correctly", () => {
    const env = getEnv();
    expect(env.DATABASE_URL).toBeDefined();
    expect(env.SESSION_SECRET.length).toBeGreaterThanOrEqual(32);
    expect(env.ENTRA_TENANT_ID).toBeDefined();
    expect(env.ENTRA_CLIENT_ID).toBeDefined();
  });

  it("should connect and execute a query against the PostgreSQL database", async () => {
    const result = await prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 as ok`;
    expect(result).toHaveLength(1);
    expect(result[0].ok).toBe(1);
  });

  it("should generate cryptographically random nonce and state", () => {
    const state1 = generateOidcState();
    const state2 = generateOidcState();
    expect(state1).not.toBe(state2);
    expect(state1.length).toBeGreaterThan(20);

    const nonce1 = generateOidcNonce();
    const nonce2 = generateOidcNonce();
    expect(nonce1).not.toBe(nonce2);
  });

  it("should perform timing-safe string comparison", () => {
    expect(timingSafeEqualString("secret-token-123", "secret-token-123")).toBe(true);
    expect(timingSafeEqualString("secret-token-123", "secret-token-999")).toBe(false);
    expect(timingSafeEqualString("short", "longer-string")).toBe(false);
  });

  it("should securely sign and verify session tokens", async () => {
    const testPayload: SessionPayload = {
      userId: "user-uuid-123",
      email: "test.student@nutm.edu.ng",
      displayName: "Test Student",
      roles: ["STUDENT"],
      accountStatus: "APPROVED",
      entraTenantId: "nutm-tenant-123",
      entraObjectId: "ms-oid-456",
    };

    const token = await createSessionToken(testPayload);
    expect(typeof token).toBe("string");

    const verified = await verifySessionToken(token);
    expect(verified.userId).toBe(testPayload.userId);
    expect(verified.email).toBe(testPayload.email);
    expect(verified.roles).toContain("STUDENT");
    expect(verified.accountStatus).toBe("APPROVED");
  });

  it("should reject session token with invalid signature or expired token", async () => {
    const invalidToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature";
    await expect(verifySessionToken(invalidToken)).rejects.toThrow();
  });

  it("should prevent directory traversal attacks in storage provider", async () => {
    const storage = new LocalStorageProvider("./storage-test");
    await expect(storage.getFileBuffer("../../../etc/passwd")).rejects.toThrow();
  });

  it("should store and retrieve file correctly via storage provider", async () => {
    const storage = new LocalStorageProvider("./storage-test");
    const testContent = Buffer.from("Hello NUTM Learn LMS", "utf8");
    const saveResult = await storage.saveFile("lecture1.txt", testContent);

    expect(saveResult.storageRef).toBeDefined();
    expect(saveResult.fileSizeBytes).toBe(BigInt(testContent.length));

    const retrieved = await storage.getFileBuffer(saveResult.storageRef);
    expect(retrieved.toString("utf8")).toBe("Hello NUTM Learn LMS");

    await storage.deleteFile(saveResult.storageRef);
  });
});
