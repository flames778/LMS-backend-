import { requireApproved } from "@/modules/auth/guard";
import { gradeSubmission } from "@/modules/grading/grading.service";
import { errorResponse, jsonResponse } from "@/lib/errors/api-error";
import { z } from "zod";

const gradeSubmissionSchema = z.object({
  awardedMarks: z.number().min(0),
  maximumMarks: z.number().positive(),
  feedback: z.string().optional(),
});

export async function POST(req: Request, props: { params: Promise<{ submissionId: string }> }) {
  const params = await props.params;
  const requestId = crypto.randomUUID();
  try {
    const context = await requireApproved(req);

    const body = await req.json();
    const parsed = gradeSubmissionSchema.parse(body);

    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip");
    const userAgent = req.headers.get("user-agent");

    const grade = await gradeSubmission(params.submissionId, parsed, context, {
      requestId,
      ipAddress,
      userAgent,
    });

    return jsonResponse(
      {
        message: "Submission graded successfully (saved as UNRELEASED until approved).",
        grade,
      },
      200,
      requestId
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
