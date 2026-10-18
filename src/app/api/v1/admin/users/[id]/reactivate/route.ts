import { requirePermission } from "@/modules/auth/guard";
import { SystemPermissions } from "@/modules/roles/roles.constants";
import { reactivateUser } from "@/modules/approvals/approvals.service";
import { errorResponse, jsonResponse } from "@/lib/errors/api-error";

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const requestId = crypto.randomUUID();
  try {
    const context = await requirePermission(req, SystemPermissions.USERS_SUSPEND);

    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip");
    const userAgent = req.headers.get("user-agent");

    const result = await reactivateUser({
      targetUserId: params.id,
      actorId: context.user.id,
      requestIdHeader: requestId,
      ipAddress,
      userAgent,
    });

    return jsonResponse(
      {
        message: "User account reactivated successfully.",
        user: {
          id: result.id,
          email: result.email,
          accountStatus: result.accountStatus,
        },
      },
      200,
      requestId
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
