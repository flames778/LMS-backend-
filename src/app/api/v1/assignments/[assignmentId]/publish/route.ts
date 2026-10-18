import { requireApproved } from "@/modules/auth/guard";
import { publishAssignment } from "@/modules/assignments/assignments.service";
import { errorResponse, jsonResponse } from "@/lib/errors/api-error";

export async function POST(req: Request, props: { params: Promise<{ assignmentId: string }> }) {
  const params = await props.params;
  const requestId = crypto.randomUUID();
  try {
    const context = await requireApproved(req);
    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip");
    const userAgent = req.headers.get("user-agent");

    const updated = await publishAssignment(params.assignmentId, context, {
      requestId,
      ipAddress,
      userAgent,
    });

    return jsonResponse(
      {
        message: "Assignment published successfully.",
        assignment: {
          ...updated,
          maxFileSizeBytes: Number(updated.maxFileSizeBytes),
        },
      },
      200,
      requestId
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
