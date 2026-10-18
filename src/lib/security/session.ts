import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getEnv } from "@/lib/validation/env";
import { UnauthorizedError } from "@/lib/errors/api-error";

export interface SessionPayload {
  userId: string;
  email: string;
  displayName: string;
  roles: string[];
  accountStatus: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
  entraTenantId: string;
  entraObjectId: string;
  [key: string]: unknown;
}

export const SESSION_COOKIE_NAME = "nutm_session";
export const OIDC_STATE_COOKIE_NAME = "nutm_oidc_state";

function getSecretKey(): Uint8Array {
  const secret = getEnv().SESSION_SECRET;
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  const env = getEnv();
  const secretKey = getSecretKey();

  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("nutm-learn-backend")
    .setAudience("nutm-learn-app")
    .setExpirationTime(`${env.SESSION_MAX_AGE_SECONDS}s`)
    .sign(secretKey);

  return token;
}

export async function verifySessionToken(token: string): Promise<SessionPayload> {
  try {
    const secretKey = getSecretKey();
    const { payload } = await jwtVerify(token, secretKey, {
      issuer: "nutm-learn-backend",
      audience: "nutm-learn-app",
    });

    return payload as unknown as SessionPayload;
  } catch {
    throw new UnauthorizedError("Invalid or expired session token");
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);
  if (!sessionCookie?.value) {
    return null;
  }

  try {
    return await verifySessionToken(sessionCookie.value);
  } catch {
    return null;
  }
}
