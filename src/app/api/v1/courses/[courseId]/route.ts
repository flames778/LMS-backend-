import { requireApproved, requirePermission } from "@/modules/auth/guard";
import { SystemPermissions, SystemRoles } from "@/modules/roles/roles.constants";
import { getCourseById, updateCourse } from "@/modules/courses/courses.service";
import { errorResponse, jsonResponse, ForbiddenError } from "@/lib/errors/api-error";
import { CourseStatus } from "@prisma/client";
import { z } from "zod";

const updateCourseSchema = z.object({
  courseTitle: z.string().min(3).max(255).optional(),
  description: z.string().optional(),
  status: z.nativeEnum(CourseStatus).optional(),
});

export async function GET(req: Request, props: { params: Promise<{ courseId: string }> }) {
  const params = await props.params;
  const requestId = crypto.randomUUID();
  try {
    const context = await requireApproved(req);
    const course = await getCourseById(params.courseId, context);
    return jsonResponse(course, 200, requestId);
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function PATCH(req: Request, props: { params: Promise<{ courseId: string }> }) {
  const params = await props.params;
  const requestId = crypto.randomUUID();
  try {
    const context = await requireApproved(req);

    // Verify course access
    const course = await getCourseById(params.courseId, context);

    const isGlobalAdmin =
      context.user.roles.includes(SystemRoles.IT_ADMIN) ||
      context.user.roles.includes(SystemRoles.ACADEMIC_ADMIN);

    const isAssignedLecturer = course.memberships.some(
      (m) => m.userId === context.user.id && m.membershipType === "LECTURER"
    );

    if (!isGlobalAdmin && !isAssignedLecturer) {
      throw new ForbiddenError("Only assigned lecturers or academic administrators can update course details");
    }

    const body = await req.json();
    const parsed = updateCourseSchema.parse(body);

    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip");
    const userAgent = req.headers.get("user-agent");

    const updated = await updateCourse(params.courseId, parsed, context.user.id, {
      requestId,
      ipAddress,
      userAgent,
    });

    return jsonResponse(updated, 200, requestId);
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
