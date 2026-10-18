import { requireApproved } from "@/modules/auth/guard";
import { addAssessmentQuestion } from "@/modules/assessments/assessments.service";
import { errorResponse, jsonResponse } from "@/lib/errors/api-error";
import { QuestionType } from "@prisma/client";
import { z } from "zod";

const addQuestionSchema = z.object({
  questionText: z.string().min(3),
  questionType: z.nativeEnum(QuestionType),
  options: z.array(z.string()).min(2),
  correctAnswers: z.array(z.string()).min(1),
  marks: z.number().positive(),
  explanation: z.string().optional(),
});

export async function POST(req: Request, props: { params: Promise<{ assessmentId: string }> }) {
  const params = await props.params;
  const requestId = crypto.randomUUID();
  try {
    const context = await requireApproved(req);

    const body = await req.json();
    const parsed = addQuestionSchema.parse(body);

    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip");
    const userAgent = req.headers.get("user-agent");

    const question = await addAssessmentQuestion(params.assessmentId, parsed, context, {
      requestId,
      ipAddress,
      userAgent,
    });

    return jsonResponse(
      {
        ...question,
        options: JSON.parse(question.options),
        correctAnswers: JSON.parse(question.correctAnswers),
      },
      201,
      requestId
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
