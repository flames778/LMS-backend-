import { requireApproved } from "@/modules/auth/guard";
import { saveAttemptAnswer } from "@/modules/assessments/assessments.service";
import { errorResponse, jsonResponse } from "@/lib/errors/api-error";
import { z } from "zod";

const saveAnswerSchema = z.object({
  submittedAnswers: z.array(z.string()),
});

export async function PUT(
  req: Request,
  props: { params: Promise<{ attemptId: string; questionId: string }> }
) {
  const params = await props.params;
  const requestId = crypto.randomUUID();
  try {
    const context = await requireApproved(req);

    const body = await req.json();
    const parsed = saveAnswerSchema.parse(body);

    const answer = await saveAttemptAnswer(
      params.attemptId,
      params.questionId,
      parsed.submittedAnswers,
      context
    );

    return jsonResponse(
      {
        message: "Answer saved successfully.",
        questionId: answer.questionId,
        submittedAnswers: JSON.parse(answer.submittedAnswers),
      },
      200,
      requestId
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
