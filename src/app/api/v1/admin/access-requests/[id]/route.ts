import { requirePermission } from "@/modules/auth/guard";
import { SystemPermissions } from "@/modules/roles/roles.constants";
import { getAccessRequestById } from "@/modules/approvals/approvals.service";
import { errorResponse, jsonResponse } from "@/lib/errors/api-error";

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const requestId = crypto.randomUUID();
  try {
    await requirePermission(req, SystemPermissions.USERS_READ);
    const item = await getAccessRequestById(params.id);
    return jsonResponse(item, 200, requestId);
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
