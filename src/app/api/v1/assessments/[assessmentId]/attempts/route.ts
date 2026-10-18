import { requireApproved } from "@/modules/auth/guard";
import { startAssessmentAttempt } from "@/modules/assessments/assessments.service";
import { errorResponse, jsonResponse } from "@/lib/errors/api-error";

export async function POST(req: Request, props: { params: Promise<{ assessmentId: string }> }) {
  const params = await props.params;
  const requestId = crypto.randomUUID();
  try {
    const context = await requireApproved(req);
    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip");
    const userAgent = req.headers.get("user-agent");

    const attempt = await startAssessmentAttempt(params.assessmentId, context, {
      requestId,
      ipAddress,
      userAgent,
    });

    return jsonResponse(attempt, 201, requestId);
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
