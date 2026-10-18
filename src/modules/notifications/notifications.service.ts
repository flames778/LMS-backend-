import { prisma } from "@/lib/database/prisma";
import { PublicationStatus, MembershipType } from "@prisma/client";
import { NotFoundError, ForbiddenError, BadRequestError } from "@/lib/errors/api-error";
import { recordAuditEvent } from "@/modules/audit/audit.service";
import { AuthenticatedContext } from "@/modules/auth/guard";
import { SystemRoles, SystemPermissions } from "@/modules/roles/roles.constants";

export async function listAnnouncements(
  context: AuthenticatedContext,
  params: { courseId?: string; limit?: number; offset?: number }
) {
  const { user } = context;
  const isGlobalAdmin =
    user.roles.includes(SystemRoles.IT_ADMIN) ||
    user.roles.includes(SystemRoles.ACADEMIC_ADMIN);

  const limit = Math.min(params.limit || 50, 100);
  const offset = params.offset || 0;

  // Find courses where user is active
  const userMemberships = await prisma.courseMembership.findMany({
    where: { userId: user.id, status: "ACTIVE" },
    select: { courseId: true, membershipType: true },
  });
  const enrolledCourseIds = userMemberships.map((m) => m.courseId);

  const where: Record<string, unknown> = {};

  if (params.courseId) {
    if (!isGlobalAdmin && !enrolledCourseIds.includes(params.courseId)) {
      throw new ForbiddenError("You are not enrolled in this course");
    }
    where.courseId = params.courseId;
  } else {
    // Show institutional announcements OR enrolled course announcements
    if (!isGlobalAdmin) {
      where.OR = [{ courseId: null }, { courseId: { in: enrolledCourseIds } }];
    }
  }

  // Non-admins and non-lecturers ONLY see published announcements
  if (!isGlobalAdmin) {
    const isLecturerForCourse =
      params.courseId &&
      userMemberships.some(
        (m) => m.courseId === params.courseId && m.membershipType === MembershipType.LECTURER
      );

    if (!isLecturerForCourse) {
      where.status = PublicationStatus.PUBLISHED;
    }
  }

  const [items, total] = await Promise.all([
    prisma.announcement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        author: {
          select: {
            id: true,
            displayName: true,
            email: true,
          },
        },
        course: {
          select: {
            id: true,
            courseCode: true,
            courseTitle: true,
          },
        },
      },
    }),
    prisma.announcement.count({ where }),
  ]);

  return { items, pagination: { total, limit, offset } };
}

export async function createAnnouncement(
  data: {
    courseId?: string;
    title: string;
    content: string;
  },
  context: AuthenticatedContext,
  requestMetadata: { requestId: string; ipAddress?: string | null; userAgent?: string | null }
) {
  const { user } = context;
  const isGlobalAdmin =
    user.roles.includes(SystemRoles.IT_ADMIN) ||
    user.roles.includes(SystemRoles.ACADEMIC_ADMIN);

  // If institutional announcement (courseId null), requires admin permissions
  if (!data.courseId) {
    if (!isGlobalAdmin) {
      throw new ForbiddenError("Only academic or IT administrators can create institutional announcements");
    }
  } else {
    // Course announcement: caller must be assigned lecturer or admin
    const membership = await prisma.courseMembership.findUnique({
      where: { courseId_userId: { courseId: data.courseId, userId: user.id } },
    });
    if (!isGlobalAdmin && (!membership || membership.membershipType !== MembershipType.LECTURER)) {
      throw new ForbiddenError("Only assigned course lecturers or administrators can post course announcements");
    }
  }

  const announcement = await prisma.announcement.create({
    data: {
      courseId: data.courseId || null,
      authorId: user.id,
      title: data.title.trim(),
      content: data.content,
      status: PublicationStatus.DRAFT,
    },
  });

  await recordAuditEvent({
    actorId: user.id,
    action: "ANNOUNCEMENT_CREATED",
    targetResourceType: "announcement",
    targetResourceId: announcement.id,
    outcome: "SUCCESS",
    requestId: requestMetadata.requestId,
    ipAddress: requestMetadata.ipAddress,
    userAgent: requestMetadata.userAgent,
    metadata: {
      courseId: data.courseId || "institutional",
      title: data.title,
    },
  });

  return announcement;
}

export async function publishAnnouncement(
  announcementId: string,
  context: AuthenticatedContext,
  requestMetadata: { requestId: string; ipAddress?: string | null; userAgent?: string | null }
) {
  const announcement = await prisma.announcement.findUnique({
    where: { id: announcementId },
  });
  if (!announcement) throw new NotFoundError("Announcement not found");

  const { user } = context;
  const isGlobalAdmin =
    user.roles.includes(SystemRoles.IT_ADMIN) ||
    user.roles.includes(SystemRoles.ACADEMIC_ADMIN);

  if (announcement.courseId) {
    const membership = await prisma.courseMembership.findUnique({
      where: { courseId_userId: { courseId: announcement.courseId, userId: user.id } },
    });
    if (!isGlobalAdmin && (!membership || membership.membershipType !== MembershipType.LECTURER)) {
      throw new ForbiddenError("Only assigned course lecturers can publish course announcements");
    }
  } else if (!isGlobalAdmin) {
    throw new ForbiddenError("Only administrators can publish institutional announcements");
  }

  const updated = await prisma.announcement.update({
    where: { id: announcementId },
    data: {
      status: PublicationStatus.PUBLISHED,
      publishedAt: new Date(),
    },
  });

  // Create in-app notifications for affected members
  if (announcement.courseId) {
    const courseMembers = await prisma.courseMembership.findMany({
      where: { courseId: announcement.courseId, status: "ACTIVE" },
      select: { userId: true },
    });

    const notificationsData = courseMembers.map((m) => ({
      recipientId: m.userId,
      notificationType: "COURSE_ANNOUNCEMENT",
      title: `New announcement: ${updated.title}`,
      message: updated.content.substring(0, 150),
      relatedResourceType: "announcement",
      relatedResourceId: updated.id,
    }));

    if (notificationsData.length > 0) {
      await prisma.notification.createMany({ data: notificationsData });
    }
  }

  await recordAuditEvent({
    actorId: user.id,
    action: "ANNOUNCEMENT_PUBLISHED",
    targetResourceType: "announcement",
    targetResourceId: announcementId,
    outcome: "SUCCESS",
    requestId: requestMetadata.requestId,
    ipAddress: requestMetadata.ipAddress,
    userAgent: requestMetadata.userAgent,
    metadata: { courseId: announcement.courseId || "institutional" },
  });

  return updated;
}

export async function listUserNotifications(
  context: AuthenticatedContext,
  params: { limit?: number; offset?: number }
) {
  const { user } = context;
  const limit = Math.min(params.limit || 50, 100);
  const offset = params.offset || 0;

  const [items, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { recipientId: user.id },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.notification.count({ where: { recipientId: user.id } }),
    prisma.notification.count({ where: { recipientId: user.id, isRead: false } }),
  ]);

  return { items, unreadCount, pagination: { total, limit, offset } };
}

export async function markNotificationAsRead(notificationId: string, context: AuthenticatedContext) {
  const { user } = context;
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
  });

  if (!notification) throw new NotFoundError("Notification not found");

  if (notification.recipientId !== user.id) {
    throw new ForbiddenError("Cannot modify notifications for another user");
  }

  return await prisma.notification.update({
    where: { id: notificationId },
    data: { isRead: true },
  });
}
