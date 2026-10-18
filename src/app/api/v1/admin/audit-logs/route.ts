import { requirePermission } from "@/modules/auth/guard";
import { SystemPermissions } from "@/modules/roles/roles.constants";
import { queryAuditLogs } from "@/modules/audit/audit.service";
import { errorResponse, jsonResponse } from "@/lib/errors/api-error";

export async function GET(req: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requirePermission(req, SystemPermissions.AUDIT_READ);

    const url = new URL(req.url);
    const actorId = url.searchParams.get("actorId") || undefined;
    const targetResourceType = url.searchParams.get("targetResourceType") || undefined;
    const action = url.searchParams.get("action") || undefined;
    const limit = url.searchParams.get("limit") ? parseInt(url.searchParams.get("limit")!, 10) : undefined;
    const offset = url.searchParams.get("offset") ? parseInt(url.searchParams.get("offset")!, 10) : undefined;

    const result = await queryAuditLogs({
      actorId,
      targetResourceType,
      action,
      limit,
      offset,
    });

    return jsonResponse(result, 200, requestId);
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
