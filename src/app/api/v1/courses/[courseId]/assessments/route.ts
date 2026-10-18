import { requireApproved } from "@/modules/auth/guard";
import {
  listCourseAssessments,
  createAssessment,
} from "@/modules/assessments/assessments.service";
import { errorResponse, jsonResponse } from "@/lib/errors/api-error";
import { z } from "zod";

const createAssessmentSchema = z.object({
  title: z.string().min(3).max(255),
  description: z.string().optional(),
  durationMinutes: z.number().int().positive(),
  attemptLimit: z.number().int().positive().optional(),
  availableFrom: z.string().datetime(),
  availableUntil: z.string().datetime(),
});

export async function GET(req: Request, props: { params: Promise<{ courseId: string }> }) {
  const params = await props.params;
  const requestId = crypto.randomUUID();
  try {
    const context = await requireApproved(req);
    const assessments = await listCourseAssessments(params.courseId, context);
    return jsonResponse(assessments, 200, requestId);
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function POST(req: Request, props: { params: Promise<{ courseId: string }> }) {
  const params = await props.params;
  const requestId = crypto.randomUUID();
  try {
    const context = await requireApproved(req);

    const body = await req.json();
    const parsed = createAssessmentSchema.parse(body);

    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip");
    const userAgent = req.headers.get("user-agent");

    const assessment = await createAssessment(
      params.courseId,
      {
        title: parsed.title,
        description: parsed.description,
        durationMinutes: parsed.durationMinutes,
        attemptLimit: parsed.attemptLimit,
        availableFrom: new Date(parsed.availableFrom),
        availableUntil: new Date(parsed.availableUntil),
      },
      context,
      {
        requestId,
        ipAddress,
        userAgent,
      }
    );

    return jsonResponse(assessment, 201, requestId);
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
