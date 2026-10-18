import { ConfidentialClientApplication, Configuration, LogLevel } from "@azure/msal-node";
import { getEnv } from "@/lib/validation/env";
import { UnauthorizedError } from "@/lib/errors/api-error";
import { logger } from "@/lib/logging/logger";

let msalClientInstance: ConfidentialClientApplication | null = null;

export function getMsalClient(): ConfidentialClientApplication {
  if (msalClientInstance) return msalClientInstance;

  const env = getEnv();
  const msalConfig: Configuration = {
    auth: {
      clientId: env.ENTRA_CLIENT_ID,
      authority: `https://login.microsoftonline.com/${env.ENTRA_TENANT_ID}`,
      clientSecret: env.ENTRA_CLIENT_SECRET,
    },
    system: {
      loggerOptions: {
        loggerCallback(level, message, containsPii) {
          if (containsPii) return;
          if (level === LogLevel.Error) {
            logger.error(`[MSAL] ${message}`);
          } else if (level === LogLevel.Warning) {
            logger.warn(`[MSAL] ${message}`);
          }
        },
        piiLoggingEnabled: false,
        logLevel: LogLevel.Warning,
      },
    },
  };

  msalClientInstance = new ConfidentialClientApplication(msalConfig);
  return msalClientInstance;
}

export interface ValidatedEntraIdentity {
  tenantId: string;
  objectId: string;
  email: string;
  displayName: string;
}

export async function getEntraAuthUrl(state: string, nonce: string): Promise<string> {
  const env = getEnv();
  const client = getMsalClient();

  const authCodeUrlParameters = {
    scopes: env.ENTRA_SCOPES.split(",").map((s) => s.trim()),
    redirectUri: env.ENTRA_REDIRECT_URI,
    state,
    nonce,
    prompt: "select_account",
  };

  return await client.getAuthCodeUrl(authCodeUrlParameters);
}

export async function validateAuthCode(
  code: string,
  expectedNonce: string
): Promise<ValidatedEntraIdentity> {
  const env = getEnv();
  const client = getMsalClient();

  try {
    const tokenResponse = await client.acquireTokenByCode({
      code,
      scopes: env.ENTRA_SCOPES.split(",").map((s) => s.trim()),
      redirectUri: env.ENTRA_REDIRECT_URI,
    });

    if (!tokenResponse) {
      throw new UnauthorizedError("Failed to acquire token from Microsoft Entra ID");
    }

    const idTokenClaims = tokenResponse.idTokenClaims as Record<string, unknown>;
    if (!idTokenClaims) {
      throw new UnauthorizedError("Missing ID token claims from Microsoft Entra ID response");
    }

    const tenantId = (idTokenClaims.tid as string) || "";
    const objectId = (idTokenClaims.oid as string) || "";
    const nonce = (idTokenClaims.nonce as string) || "";
    const email = (idTokenClaims.email as string) || (idTokenClaims.preferred_username as string) || "";
    const displayName = (idTokenClaims.name as string) || "NUTM User";

    // Strict institutional tenant verification
    if (tenantId !== env.ENTRA_TENANT_ID) {
      logger.warn("Authentication rejected: Attempted login from unauthorized tenant", {
        attemptedTenantId: tenantId,
        approvedTenantId: env.ENTRA_TENANT_ID,
      });
      throw new UnauthorizedError("Unauthorized Microsoft tenant. Only the official NUTM tenant is permitted.");
    }

    // Verify nonce
    if (expectedNonce && nonce && nonce !== expectedNonce) {
      logger.warn("Authentication rejected: Nonce mismatch in Entra ID response");
      throw new UnauthorizedError("Invalid authentication state or nonce mismatch");
    }

    if (!objectId) {
      throw new UnauthorizedError("Invalid Entra token: Missing immutable user object ID");
    }

    return {
      tenantId,
      objectId,
      email: email.toLowerCase().trim(),
      displayName,
    };
  } catch (err: unknown) {
    if (err instanceof UnauthorizedError) throw err;
    logger.error("Microsoft Entra ID token exchange failed", { error: String(err) });
    throw new UnauthorizedError("Authentication failed during Microsoft Entra ID verification");
  }
}
