import { requireApproved } from "@/modules/auth/guard";
import { getSubmissionById } from "@/modules/assignments/assignments.service";
import { errorResponse, jsonResponse } from "@/lib/errors/api-error";

export async function GET(req: Request, props: { params: Promise<{ submissionId: string }> }) {
  const params = await props.params;
  const requestId = crypto.randomUUID();
  try {
    const context = await requireApproved(req);
    const submission = await getSubmissionById(params.submissionId, context);

    return jsonResponse(
      {
        ...submission,
        fileSizeBytes: Number(submission.fileSizeBytes),
      },
      200,
      requestId
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
