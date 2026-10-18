import { requireApproved } from "@/modules/auth/guard";
import { getStudentSubmissions } from "@/modules/assignments/assignments.service";
import { errorResponse, jsonResponse } from "@/lib/errors/api-error";

export async function GET(req: Request, props: { params: Promise<{ assignmentId: string }> }) {
  const params = await props.params;
  const requestId = crypto.randomUUID();
  try {
    const context = await requireApproved(req);
    const submissions = await getStudentSubmissions(params.assignmentId, context);

    const serialized = submissions.map((s) => ({
      ...s,
      fileSizeBytes: Number(s.fileSizeBytes),
    }));

    return jsonResponse(serialized, 200, requestId);
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
