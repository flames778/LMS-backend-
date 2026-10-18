import { requireApproved } from "@/modules/auth/guard";
import { releaseGrade } from "@/modules/grading/grading.service";
import { errorResponse, jsonResponse } from "@/lib/errors/api-error";

export async function POST(req: Request, props: { params: Promise<{ gradeId: string }> }) {
  const params = await props.params;
  const requestId = crypto.randomUUID();
  try {
    const context = await requireApproved(req);
    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip");
    const userAgent = req.headers.get("user-agent");

    const released = await releaseGrade(params.gradeId, context, {
      requestId,
      ipAddress,
      userAgent,
    });

    return jsonResponse(
      {
        message: "Grade released successfully to student.",
        grade: released,
      },
      200,
      requestId
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
