import { requirePermission } from "@/modules/auth/guard";
import { SystemPermissions } from "@/modules/roles/roles.constants";
import { revokeUserRole } from "@/modules/approvals/approvals.service";
import { errorResponse, jsonResponse } from "@/lib/errors/api-error";

export async function DELETE(
  req: Request,
  props: { params: Promise<{ id: string; roleName: string }> }
) {
  const params = await props.params;
  const requestId = crypto.randomUUID();
  try {
    const context = await requirePermission(req, SystemPermissions.ROLES_ASSIGN);

    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip");
    const userAgent = req.headers.get("user-agent");

    await revokeUserRole({
      targetUserId: params.id,
      roleName: params.roleName,
      actorId: context.user.id,
      requestIdHeader: requestId,
      ipAddress,
      userAgent,
    });

    return jsonResponse(
      {
        message: `Role '${params.roleName}' revoked successfully.`,
      },
      200,
      requestId
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
