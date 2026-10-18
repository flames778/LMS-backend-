import { cookies } from "next/headers";
import { processEntraCallback } from "@/modules/auth/auth.service";
import { OIDC_STATE_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/lib/security/session";
import { getEnv } from "@/lib/validation/env";
import { errorResponse, jsonResponse, BadRequestError } from "@/lib/errors/api-error";

export async function GET(req: Request) {
  return handleCallback(req);
}

export async function POST(req: Request) {
  return handleCallback(req);
}

async function handleCallback(req: Request) {
  const requestId = crypto.randomUUID();
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    if (!code || !state) {
      throw new BadRequestError("Missing required Microsoft authentication code or state parameter");
    }

    const cookieStore = await cookies();
    const storedStateCookie = cookieStore.get(OIDC_STATE_COOKIE_NAME);
    let storedState: string | undefined;
    let storedNonce: string | undefined;

    if (storedStateCookie?.value) {
      try {
        const parsed = JSON.parse(storedStateCookie.value);
        storedState = parsed.state;
        storedNonce = parsed.nonce;
      } catch {
        storedState = undefined;
      }
    }

    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip");
    const userAgent = req.headers.get("user-agent");

    const result = await processEntraCallback({
      code,
      state,
      storedState,
      storedNonce,
      requestId,
      ipAddress,
      userAgent,
    });

    const env = getEnv();
    const isSecure = process.env.NODE_ENV === "production";

    const response = jsonResponse(
      {
        user: result.user,
        message: result.user.isNewUser
          ? "Account request registered. Your account is pending IT Administrator review."
          : "Authentication successful.",
      },
      200,
      requestId
    );

    // Set secure server-side session cookie
    response.cookies.set(SESSION_COOKIE_NAME, result.token, {
      httpOnly: true,
      secure: isSecure,
      sameSite: "lax",
      path: "/",
      maxAge: env.SESSION_MAX_AGE_SECONDS,
    });

    // Clear one-time state cookie
    response.cookies.delete(OIDC_STATE_COOKIE_NAME);

    return response;
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
