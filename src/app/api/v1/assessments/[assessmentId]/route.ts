import { requireApproved } from "@/modules/auth/guard";
import { getAssessmentForStudent } from "@/modules/assessments/assessments.service";
import { errorResponse, jsonResponse } from "@/lib/errors/api-error";

export async function GET(req: Request, props: { params: Promise<{ assessmentId: string }> }) {
  const params = await props.params;
  const requestId = crypto.randomUUID();
  try {
    const context = await requireApproved(req);
    const assessment = await getAssessmentForStudent(params.assessmentId, context);
    return jsonResponse(assessment, 200, requestId);
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
