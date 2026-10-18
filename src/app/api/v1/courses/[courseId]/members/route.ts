import { requireApproved, requirePermission } from "@/modules/auth/guard";
import { SystemPermissions } from "@/modules/roles/roles.constants";
import { listCourseMembers, addCourseMember } from "@/modules/courses/courses.service";
import { errorResponse, jsonResponse } from "@/lib/errors/api-error";
import { MembershipType } from "@prisma/client";
import { z } from "zod";

const addMemberSchema = z.object({
  userId: z.string().uuid("Invalid user ID"),
  membershipType: z.nativeEnum(MembershipType),
});

export async function GET(req: Request, props: { params: Promise<{ courseId: string }> }) {
  const params = await props.params;
  const requestId = crypto.randomUUID();
  try {
    const context = await requireApproved(req);
    const url = new URL(req.url);
    const membershipType = url.searchParams.get("membershipType") as MembershipType | null;
    const limit = url.searchParams.get("limit") ? parseInt(url.searchParams.get("limit")!, 10) : undefined;
    const offset = url.searchParams.get("offset") ? parseInt(url.searchParams.get("offset")!, 10) : undefined;

    const result = await listCourseMembers(params.courseId, context, {
      membershipType: membershipType || undefined,
      limit,
      offset,
    });

    return jsonResponse(result, 200, requestId);
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function POST(req: Request, props: { params: Promise<{ courseId: string }> }) {
  const params = await props.params;
  const requestId = crypto.randomUUID();
  try {
    const context = await requirePermission(req, SystemPermissions.ENROLMENTS_MANAGE);

    const body = await req.json();
    const parsed = addMemberSchema.parse(body);

    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip");
    const userAgent = req.headers.get("user-agent");

    const member = await addCourseMember(params.courseId, parsed, context.user.id, {
      requestId,
      ipAddress,
      userAgent,
    });

    return jsonResponse(member, 201, requestId);
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
