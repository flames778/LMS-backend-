import { requirePermission } from "@/modules/auth/guard";
import { SystemPermissions } from "@/modules/roles/roles.constants";
import { updateCourseMember, removeCourseMember } from "@/modules/courses/courses.service";
import { errorResponse, jsonResponse } from "@/lib/errors/api-error";
import { MembershipStatus, MembershipType } from "@prisma/client";
import { z } from "zod";

const updateMemberSchema = z.object({
  status: z.nativeEnum(MembershipStatus).optional(),
  membershipType: z.nativeEnum(MembershipType).optional(),
});

export async function PATCH(
  req: Request,
  props: { params: Promise<{ courseId: string; userId: string }> }
) {
  const params = await props.params;
  const requestId = crypto.randomUUID();
  try {
    const context = await requirePermission(req, SystemPermissions.ENROLMENTS_MANAGE);

    const body = await req.json();
    const parsed = updateMemberSchema.parse(body);

    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip");
    const userAgent = req.headers.get("user-agent");

    const updated = await updateCourseMember(
      params.courseId,
      params.userId,
      parsed,
      context.user.id,
      {
        requestId,
        ipAddress,
        userAgent,
      }
    );

    return jsonResponse(updated, 200, requestId);
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function DELETE(
  req: Request,
  props: { params: Promise<{ courseId: string; userId: string }> }
) {
  const params = await props.params;
  const requestId = crypto.randomUUID();
  try {
    const context = await requirePermission(req, SystemPermissions.ENROLMENTS_MANAGE);

    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip");
    const userAgent = req.headers.get("user-agent");

    await removeCourseMember(params.courseId, params.userId, context.user.id, {
      requestId,
      ipAddress,
      userAgent,
    });

    return jsonResponse(
      {
        message: "Course membership removed successfully.",
      },
      200,
      requestId
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
