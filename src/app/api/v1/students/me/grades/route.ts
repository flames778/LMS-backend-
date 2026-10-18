import { requireApproved } from "@/modules/auth/guard";
import { getStudentGrades } from "@/modules/grading/grading.service";
import { errorResponse, jsonResponse } from "@/lib/errors/api-error";

export async function GET(req: Request) {
  const requestId = crypto.randomUUID();
  try {
    const context = await requireApproved(req);
    const grades = await getStudentGrades(context);
    return jsonResponse(grades, 200, requestId);
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
