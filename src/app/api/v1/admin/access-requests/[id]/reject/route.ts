import { requirePermission } from "@/modules/auth/guard";
import { SystemPermissions } from "@/modules/roles/roles.constants";
import { rejectAccessRequest } from "@/modules/approvals/approvals.service";
import { errorResponse, jsonResponse } from "@/lib/errors/api-error";
import { z } from "zod";

const rejectSchema = z.object({
  decisionReason: z.string().min(3, "A valid decision reason is required for audit compliance"),
});

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const requestId = crypto.randomUUID();
  try {
    const context = await requirePermission(req, SystemPermissions.USERS_APPROVE);

    const body = await req.json();
    const parsed = rejectSchema.parse(body);

    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip");
    const userAgent = req.headers.get("user-agent");

    const result = await rejectAccessRequest({
      requestId: params.id,
      reviewerId: context.user.id,
      decisionReason: parsed.decisionReason,
      requestIdHeader: requestId,
      ipAddress,
      userAgent,
    });

    return jsonResponse(
      {
        message: "Access request rejected.",
        request: result,
      },
      200,
      requestId
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
