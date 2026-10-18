import { requirePermission } from "@/modules/auth/guard";
import { SystemPermissions, SystemRole } from "@/modules/roles/roles.constants";
import { approveAccessRequest } from "@/modules/approvals/approvals.service";
import { errorResponse, jsonResponse } from "@/lib/errors/api-error";
import { z } from "zod";

const approveSchema = z.object({
  roleName: z.enum(["STUDENT", "LECTURER", "IT_ADMIN", "ACADEMIC_ADMIN"]).optional(),
  decisionReason: z.string().optional(),
});

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const requestId = crypto.randomUUID();
  try {
    const context = await requirePermission(req, SystemPermissions.USERS_APPROVE);

    let body = {};
    try {
      body = await req.json();
    } catch {
      // Body is optional
    }

    const parsed = approveSchema.parse(body);

    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip");
    const userAgent = req.headers.get("user-agent");

    const result = await approveAccessRequest({
      requestId: params.id,
      reviewerId: context.user.id,
      roleName: parsed.roleName as SystemRole | undefined,
      decisionReason: parsed.decisionReason,
      requestIdHeader: requestId,
      ipAddress,
      userAgent,
    });

    return jsonResponse(
      {
        message: "Access request approved successfully.",
        request: result,
      },
      200,
      requestId
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
