import { SESSION_COOKIE_NAME } from "@/lib/security/session";
import { jsonResponse } from "@/lib/errors/api-error";
import { recordAuditEvent } from "@/modules/audit/audit.service";
import { authenticateRequest } from "@/modules/auth/guard";

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  try {
    const context = await authenticateRequest(req);
    await recordAuditEvent({
      actorId: context.user.id,
      action: "AUTH_LOGOUT",
      targetResourceType: "user",
      targetResourceId: context.user.id,
      outcome: "SUCCESS",
      requestId,
    });
  } catch {
    // If not authenticated or already expired, proceed with clearing cookie
  }

  const response = jsonResponse({ message: "Successfully logged out" }, 200, requestId);
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}
