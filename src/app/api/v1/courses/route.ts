import { requireApproved, requirePermission } from "@/modules/auth/guard";
import { SystemPermissions } from "@/modules/roles/roles.constants";
import { listCourses, createCourse } from "@/modules/courses/courses.service";
import { errorResponse, jsonResponse } from "@/lib/errors/api-error";
import { CourseStatus } from "@prisma/client";
import { z } from "zod";

const createCourseSchema = z.object({
  courseCode: z.string().min(2).max(20),
  courseTitle: z.string().min(3).max(255),
  description: z.string().optional(),
  academicTerm: z.string().min(2).max(50),
});

export async function GET(req: Request) {
  const requestId = crypto.randomUUID();
  try {
    const context = await requireApproved(req);
    const url = new URL(req.url);
    const status = url.searchParams.get("status") as CourseStatus | null;
    const academicTerm = url.searchParams.get("academicTerm") || undefined;
    const limit = url.searchParams.get("limit") ? parseInt(url.searchParams.get("limit")!, 10) : undefined;
    const offset = url.searchParams.get("offset") ? parseInt(url.searchParams.get("offset")!, 10) : undefined;

    const result = await listCourses(context, {
      status: status || undefined,
      academicTerm,
      limit,
      offset,
    });

    return jsonResponse(result, 200, requestId);
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  try {
    const context = await requirePermission(req, SystemPermissions.COURSES_CREATE);

    const body = await req.json();
    const parsed = createCourseSchema.parse(body);

    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip");
    const userAgent = req.headers.get("user-agent");

    const course = await createCourse(parsed, context.user.id, {
      requestId,
      ipAddress,
      userAgent,
    });

    return jsonResponse(course, 201, requestId);
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
