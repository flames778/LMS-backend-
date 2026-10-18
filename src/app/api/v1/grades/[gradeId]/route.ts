import { requireApproved } from "@/modules/auth/guard";
import { amendGrade } from "@/modules/grading/grading.service";
import { errorResponse, jsonResponse } from "@/lib/errors/api-error";
import { z } from "zod";

const amendGradeSchema = z.object({
  newMarks: z.number().min(0),
  newFeedback: z.string().optional(),
  changeReason: z.string().min(3, "A valid change reason is required for grade audit compliance"),
});

export async function PATCH(req: Request, props: { params: Promise<{ gradeId: string }> }) {
  const params = await props.params;
  const requestId = crypto.randomUUID();
  try {
    const context = await requireApproved(req);

    const body = await req.json();
    const parsed = amendGradeSchema.parse(body);

    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip");
    const userAgent = req.headers.get("user-agent");

    const updated = await amendGrade(params.gradeId, parsed, context, {
      requestId,
      ipAddress,
      userAgent,
    });

    return jsonResponse(
      {
        message: "Grade amended successfully with audit trail recorded.",
        grade: updated,
      },
      200,
      requestId
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
