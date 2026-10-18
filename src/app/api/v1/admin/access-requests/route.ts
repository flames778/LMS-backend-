import { requirePermission } from "@/modules/auth/guard";
import { SystemPermissions } from "@/modules/roles/roles.constants";
import { listAccessRequests } from "@/modules/approvals/approvals.service";
import { errorResponse, jsonResponse } from "@/lib/errors/api-error";
import { AccessRequestStatus } from "@prisma/client";

export async function GET(req: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requirePermission(req, SystemPermissions.USERS_READ);

    const url = new URL(req.url);
    const statusParam = url.searchParams.get("status") as AccessRequestStatus | null;
    const limit = url.searchParams.get("limit") ? parseInt(url.searchParams.get("limit")!, 10) : undefined;
    const offset = url.searchParams.get("offset") ? parseInt(url.searchParams.get("offset")!, 10) : undefined;

    const result = await listAccessRequests({
      status: statusParam || undefined,
      limit,
      offset,
    });

    return jsonResponse(result, 200, requestId);
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
