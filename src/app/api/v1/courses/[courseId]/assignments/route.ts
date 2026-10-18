import { requireApproved } from "@/modules/auth/guard";
import { listCourseAssignments, createAssignment } from "@/modules/assignments/assignments.service";
import { errorResponse, jsonResponse } from "@/lib/errors/api-error";
import { LateSubmissionPolicy, ResubmissionPolicy } from "@prisma/client";
import { z } from "zod";

const createAssignmentSchema = z.object({
  title: z.string().min(3).max(255),
  instructions: z.string().min(5),
  availableFrom: z.string().datetime(),
  dueDate: z.string().datetime(),
  maximumMarks: z.number().positive(),
  acceptedFileTypes: z.string().optional(),
  maxFileSizeBytes: z.number().positive().optional(),
  lateSubmissionPolicy: z.nativeEnum(LateSubmissionPolicy).optional(),
  resubmissionPolicy: z.nativeEnum(ResubmissionPolicy).optional(),
});

export async function GET(req: Request, props: { params: Promise<{ courseId: string }> }) {
  const params = await props.params;
  const requestId = crypto.randomUUID();
  try {
    const context = await requireApproved(req);
    const assignments = await listCourseAssignments(params.courseId, context);
    return jsonResponse(assignments, 200, requestId);
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
    const parsed = createAssignmentSchema.parse(body);

    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip");
    const userAgent = req.headers.get("user-agent");

    const assignment = await createAssignment(
      params.courseId,
      {
        title: parsed.title,
        instructions: parsed.instructions,
        availableFrom: new Date(parsed.availableFrom),
        dueDate: new Date(parsed.dueDate),
        maximumMarks: parsed.maximumMarks,
        acceptedFileTypes: parsed.acceptedFileTypes,
        maxFileSizeBytes: parsed.maxFileSizeBytes ? BigInt(parsed.maxFileSizeBytes) : undefined,
        lateSubmissionPolicy: parsed.lateSubmissionPolicy,
        resubmissionPolicy: parsed.resubmissionPolicy,
      },
      context,
      {
        requestId,
        ipAddress,
        userAgent,
      }
    );

    return jsonResponse(
      {
        ...assignment,
        maxFileSizeBytes: Number(assignment.maxFileSizeBytes),
      },
      201,
      requestId
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
