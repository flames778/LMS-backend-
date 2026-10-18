import { NextResponse } from "next/server";
import { getEntraAuthUrl } from "@/lib/microsoft/entra";
import { generateOidcState, generateOidcNonce } from "@/lib/security/auth-crypto";
import { OIDC_STATE_COOKIE_NAME } from "@/lib/security/session";
import { errorResponse, jsonResponse } from "@/lib/errors/api-error";

export async function GET(req: Request) {
  try {
    const state = generateOidcState();
    const nonce = generateOidcNonce();

    const authUrl = await getEntraAuthUrl(state, nonce);

    const isSecure = process.env.NODE_ENV === "production";
    const cookiePayload = JSON.stringify({ state, nonce });

    const response = jsonResponse({
      authUrl,
      state,
    });

    response.cookies.set(OIDC_STATE_COOKIE_NAME, cookiePayload, {
      httpOnly: true,
      secure: isSecure,
      sameSite: "lax",
      path: "/",
      maxAge: 600, // 10 minutes
    });

    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
