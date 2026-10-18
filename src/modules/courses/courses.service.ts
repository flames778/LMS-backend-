import { prisma } from "@/lib/database/prisma";
import { CourseStatus, MembershipStatus, MembershipType } from "@prisma/client";
import { NotFoundError, ConflictError, ForbiddenError } from "@/lib/errors/api-error";
import { recordAuditEvent } from "@/modules/audit/audit.service";
import { AuthenticatedContext } from "@/modules/auth/guard";
import { SystemRoles, SystemPermissions } from "@/modules/roles/roles.constants";

export interface ListCoursesParams {
  limit?: number;
  offset?: number;
  status?: CourseStatus;
  academicTerm?: string;
}

export async function listCourses(context: AuthenticatedContext, params: ListCoursesParams) {
  const limit = Math.min(params.limit || 50, 100);
  const offset = params.offset || 0;
  const { user } = context;

  const isStaffOrAdmin =
    user.roles.includes(SystemRoles.IT_ADMIN) ||
    user.roles.includes(SystemRoles.ACADEMIC_ADMIN);

  const where: Record<string, unknown> = {};
  if (params.status) where.status = params.status;
  if (params.academicTerm) where.academicTerm = params.academicTerm;

  // Strict institutional access: Students and ordinary lecturers see only their assigned courses
  if (!isStaffOrAdmin) {
    where.memberships = {
      some: {
        userId: user.id,
        status: MembershipStatus.ACTIVE,
      },
    };
  }

  const [items, total] = await Promise.all([
    prisma.course.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: { courseCode: "asc" },
      include: {
        _count: {
          select: {
            memberships: true,
            materials: true,
            assignments: true,
          },
        },
      },
    }),
    prisma.course.count({ where }),
  ]);

  return { items, pagination: { total, limit, offset } };
}

export async function getCourseById(courseId: string, context: AuthenticatedContext) {
  const { user } = context;
  const isStaffOrAdmin =
    user.roles.includes(SystemRoles.IT_ADMIN) ||
    user.roles.includes(SystemRoles.ACADEMIC_ADMIN);

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      memberships: {
        where: isStaffOrAdmin ? {} : { userId: user.id, status: MembershipStatus.ACTIVE },
        select: {
          membershipType: true,
          status: true,
          userId: true,
        },
      },
      _count: {
        select: {
          memberships: true,
          materials: true,
          assignments: true,
        },
      },
    },
  });

  if (!course) {
    throw new NotFoundError("Course not found");
  }

  if (!isStaffOrAdmin && course.memberships.length === 0) {
    throw new ForbiddenError("You are not enrolled in or assigned to this course");
  }

  return course;
}

export async function createCourse(
  data: {
    courseCode: string;
    courseTitle: string;
    description?: string;
    academicTerm: string;
  },
  actorId: string,
  requestMetadata: { requestId: string; ipAddress?: string | null; userAgent?: string | null }
) {
  const existing = await prisma.course.findUnique({
    where: {
      courseCode_academicTerm: {
        courseCode: data.courseCode.toUpperCase().trim(),
        academicTerm: data.academicTerm.trim(),
      },
    },
  });

  if (existing) {
    throw new ConflictError(
      `Course '${data.courseCode}' already exists for academic term '${data.academicTerm}'`
    );
  }

  const course = await prisma.course.create({
    data: {
      courseCode: data.courseCode.toUpperCase().trim(),
      courseTitle: data.courseTitle.trim(),
      description: data.description,
      academicTerm: data.academicTerm.trim(),
      status: CourseStatus.ACTIVE,
    },
  });

  await recordAuditEvent({
    actorId,
    action: "COURSE_CREATED",
    targetResourceType: "course",
    targetResourceId: course.id,
    outcome: "SUCCESS",
    requestId: requestMetadata.requestId,
    ipAddress: requestMetadata.ipAddress,
    userAgent: requestMetadata.userAgent,
    metadata: { courseCode: course.courseCode, academicTerm: course.academicTerm },
  });

  return course;
}

export async function updateCourse(
  courseId: string,
  data: {
    courseTitle?: string;
    description?: string;
    status?: CourseStatus;
  },
  actorId: string,
  requestMetadata: { requestId: string; ipAddress?: string | null; userAgent?: string | null }
) {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) throw new NotFoundError("Course not found");

  const updated = await prisma.course.update({
    where: { id: courseId },
    data: {
      ...(data.courseTitle ? { courseTitle: data.courseTitle.trim() } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.status ? { status: data.status } : {}),
    },
  });

  await recordAuditEvent({
    actorId,
    action: "COURSE_UPDATED",
    targetResourceType: "course",
    targetResourceId: courseId,
    outcome: "SUCCESS",
    requestId: requestMetadata.requestId,
    ipAddress: requestMetadata.ipAddress,
    userAgent: requestMetadata.userAgent,
    metadata: data,
  });

  return updated;
}

export async function archiveCourse(
  courseId: string,
  actorId: string,
  requestMetadata: { requestId: string; ipAddress?: string | null; userAgent?: string | null }
) {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) throw new NotFoundError("Course not found");

  const updated = await prisma.course.update({
    where: { id: courseId },
    data: { status: CourseStatus.ARCHIVED },
  });

  await recordAuditEvent({
    actorId,
    action: "COURSE_ARCHIVED",
    targetResourceType: "course",
    targetResourceId: courseId,
    outcome: "SUCCESS",
    requestId: requestMetadata.requestId,
    ipAddress: requestMetadata.ipAddress,
    userAgent: requestMetadata.userAgent,
  });

  return updated;
}

export async function listCourseMembers(
  courseId: string,
  context: AuthenticatedContext,
  params: { limit?: number; offset?: number; membershipType?: MembershipType }
) {
  // Check caller access to course
  await getCourseById(courseId, context);

  const limit = Math.min(params.limit || 50, 100);
  const offset = params.offset || 0;
  const where: Record<string, unknown> = { courseId };
  if (params.membershipType) where.membershipType = params.membershipType;

  const [members, total] = await Promise.all([
    prisma.courseMembership.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: { createdAt: "asc" },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
            accountStatus: true,
          },
        },
      },
    }),
    prisma.courseMembership.count({ where }),
  ]);

  return { items: members, pagination: { total, limit, offset } };
}

export async function addCourseMember(
  courseId: string,
  data: {
    userId: string;
    membershipType: MembershipType;
  },
  actorId: string,
  requestMetadata: { requestId: string; ipAddress?: string | null; userAgent?: string | null }
) {
  const [course, targetUser] = await Promise.all([
    prisma.course.findUnique({ where: { id: courseId } }),
    prisma.user.findUnique({ where: { id: data.userId } }),
  ]);

  if (!course) throw new NotFoundError("Course not found");
  if (!targetUser) throw new NotFoundError("Target user not found");

  const membership = await prisma.courseMembership.upsert({
    where: {
      courseId_userId: {
        courseId,
        userId: data.userId,
      },
    },
    update: {
      membershipType: data.membershipType,
      status: MembershipStatus.ACTIVE,
    },
    create: {
      courseId,
      userId: data.userId,
      membershipType: data.membershipType,
      status: MembershipStatus.ACTIVE,
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          displayName: true,
        },
      },
    },
  });

  await recordAuditEvent({
    actorId,
    action: "COURSE_MEMBER_ADDED",
    targetResourceType: "course_membership",
    targetResourceId: membership.id,
    outcome: "SUCCESS",
    requestId: requestMetadata.requestId,
    ipAddress: requestMetadata.ipAddress,
    userAgent: requestMetadata.userAgent,
    metadata: {
      courseId,
      targetUserId: data.userId,
      membershipType: data.membershipType,
    },
  });

  return membership;
}

export async function updateCourseMember(
  courseId: string,
  targetUserId: string,
  data: {
    status?: MembershipStatus;
    membershipType?: MembershipType;
  },
  actorId: string,
  requestMetadata: { requestId: string; ipAddress?: string | null; userAgent?: string | null }
) {
  const membership = await prisma.courseMembership.findUnique({
    where: {
      courseId_userId: {
        courseId,
        userId: targetUserId,
      },
    },
  });

  if (!membership) throw new NotFoundError("Course membership not found");

  const updated = await prisma.courseMembership.update({
    where: { id: membership.id },
    data: {
      ...(data.status ? { status: data.status } : {}),
      ...(data.membershipType ? { membershipType: data.membershipType } : {}),
    },
  });

  await recordAuditEvent({
    actorId,
    action: "COURSE_MEMBER_UPDATED",
    targetResourceType: "course_membership",
    targetResourceId: membership.id,
    outcome: "SUCCESS",
    requestId: requestMetadata.requestId,
    ipAddress: requestMetadata.ipAddress,
    userAgent: requestMetadata.userAgent,
    metadata: data,
  });

  return updated;
}

export async function removeCourseMember(
  courseId: string,
  targetUserId: string,
  actorId: string,
  requestMetadata: { requestId: string; ipAddress?: string | null; userAgent?: string | null }
) {
  const membership = await prisma.courseMembership.findUnique({
    where: {
      courseId_userId: {
        courseId,
        userId: targetUserId,
      },
    },
  });

  if (!membership) throw new NotFoundError("Course membership not found");

  await prisma.courseMembership.delete({
    where: { id: membership.id },
  });

  await recordAuditEvent({
    actorId,
    action: "COURSE_MEMBER_REMOVED",
    targetResourceType: "course_membership",
    targetResourceId: membership.id,
    outcome: "SUCCESS",
    requestId: requestMetadata.requestId,
    ipAddress: requestMetadata.ipAddress,
    userAgent: requestMetadata.userAgent,
    metadata: { courseId, targetUserId },
  });

  return { success: true };
}
