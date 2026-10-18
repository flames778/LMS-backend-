import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/database/prisma";
import {
  createAnnouncement,
  publishAnnouncement,
  listAnnouncements,
  listUserNotifications,
  markNotificationAsRead,
} from "@/modules/notifications/notifications.service";
import { SystemRoles, SystemPermissions } from "@/modules/roles/roles.constants";
import { AccountStatus, MembershipType, PublicationStatus } from "@prisma/client";
import { AuthenticatedContext } from "@/modules/auth/guard";

describe("Phase 6: Announcements, Notifications, and Audit Trail", () => {
  let adminContext: AuthenticatedContext;
  let lecturerContext: AuthenticatedContext;
  let studentAContext: AuthenticatedContext;
  let studentOutsideContext: AuthenticatedContext;
  let course: any;

  beforeAll(async () => {
    // Clean up
    await prisma.announcement.deleteMany({
      where: {
        author: {
          email: {
            in: [
              "admin.ann@nutm.edu.ng",
              "lecturer.ann@nutm.edu.ng",
            ],
          },
        },
      },
    });
    await prisma.course.deleteMany({ where: { courseCode: "ANN101" } });
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            "admin.ann@nutm.edu.ng",
            "lecturer.ann@nutm.edu.ng",
            "student.ann.a@nutm.edu.ng",
            "student.ann.outside@nutm.edu.ng",
          ],
        },
      },
    });

    const admin = await prisma.user.create({
      data: {
        email: "admin.ann@nutm.edu.ng",
        displayName: "Admin Ann",
        entraTenantId: "nutm-tenant-test",
        entraObjectId: "admin-ann-oid",
        accountStatus: AccountStatus.APPROVED,
      },
    });
    adminContext = {
      user: {
        id: admin.id,
        email: admin.email,
        displayName: admin.displayName,
        accountStatus: admin.accountStatus,
        entraTenantId: admin.entraTenantId,
        entraObjectId: admin.entraObjectId,
        roles: [SystemRoles.IT_ADMIN],
        permissions: [SystemPermissions.ANNOUNCEMENTS_CREATE, SystemPermissions.ANNOUNCEMENTS_PUBLISH],
      },
      session: {
        userId: admin.id,
        email: admin.email,
        displayName: admin.displayName,
        roles: [SystemRoles.IT_ADMIN],
        accountStatus: "APPROVED",
        entraTenantId: admin.entraTenantId,
        entraObjectId: admin.entraObjectId,
      },
    };

    const lecturer = await prisma.user.create({
      data: {
        email: "lecturer.ann@nutm.edu.ng",
        displayName: "Lecturer Ann",
        entraTenantId: "nutm-tenant-test",
        entraObjectId: "lecturer-ann-oid",
        accountStatus: AccountStatus.APPROVED,
      },
    });
    lecturerContext = {
      user: {
        id: lecturer.id,
        email: lecturer.email,
        displayName: lecturer.displayName,
        accountStatus: lecturer.accountStatus,
        entraTenantId: lecturer.entraTenantId,
        entraObjectId: lecturer.entraObjectId,
        roles: [SystemRoles.LECTURER],
        permissions: [SystemPermissions.ANNOUNCEMENTS_CREATE, SystemPermissions.ANNOUNCEMENTS_PUBLISH],
      },
      session: {
        userId: lecturer.id,
        email: lecturer.email,
        displayName: lecturer.displayName,
        roles: [SystemRoles.LECTURER],
        accountStatus: "APPROVED",
        entraTenantId: lecturer.entraTenantId,
        entraObjectId: lecturer.entraObjectId,
      },
    };

    const studentA = await prisma.user.create({
      data: {
        email: "student.ann.a@nutm.edu.ng",
        displayName: "Student Ann A",
        entraTenantId: "nutm-tenant-test",
        entraObjectId: "student-ann-a-oid",
        accountStatus: AccountStatus.APPROVED,
      },
    });
    studentAContext = {
      user: {
        id: studentA.id,
        email: studentA.email,
        displayName: studentA.displayName,
        accountStatus: studentA.accountStatus,
        entraTenantId: studentA.entraTenantId,
        entraObjectId: studentA.entraObjectId,
        roles: [SystemRoles.STUDENT],
        permissions: [],
      },
      session: {
        userId: studentA.id,
        email: studentA.email,
        displayName: studentA.displayName,
        roles: [SystemRoles.STUDENT],
        accountStatus: "APPROVED",
        entraTenantId: studentA.entraTenantId,
        entraObjectId: studentA.entraObjectId,
      },
    };

    const studentOutside = await prisma.user.create({
      data: {
        email: "student.ann.outside@nutm.edu.ng",
        displayName: "Student Outside",
        entraTenantId: "nutm-tenant-test",
        entraObjectId: "student-ann-out-oid",
        accountStatus: AccountStatus.APPROVED,
      },
    });
    studentOutsideContext = {
      user: {
        id: studentOutside.id,
        email: studentOutside.email,
        displayName: studentOutside.displayName,
        accountStatus: studentOutside.accountStatus,
        entraTenantId: studentOutside.entraTenantId,
        entraObjectId: studentOutside.entraObjectId,
        roles: [SystemRoles.STUDENT],
        permissions: [],
      },
      session: {
        userId: studentOutside.id,
        email: studentOutside.email,
        displayName: studentOutside.displayName,
        roles: [SystemRoles.STUDENT],
        accountStatus: "APPROVED",
        entraTenantId: studentOutside.entraTenantId,
        entraObjectId: studentOutside.entraObjectId,
      },
    };

    course = await prisma.course.create({
      data: {
        courseCode: "ANN101",
        courseTitle: "Communications & Announcements",
        academicTerm: "2026-Fall",
      },
    });

    await prisma.courseMembership.createMany({
      data: [
        { courseId: course.id, userId: lecturer.id, membershipType: MembershipType.LECTURER },
        { courseId: course.id, userId: studentA.id, membershipType: MembershipType.STUDENT },
      ],
    });
  });

  it("should create course announcement as DRAFT and hide from students until published", async () => {
    const announcement = await createAnnouncement(
      {
        courseId: course.id,
        title: "Guest Speaker Next Friday",
        content: "We will be hosting a guest lecture from Microsoft on AI architectures.",
      },
      lecturerContext,
      { requestId: "req-ann-1" }
    );

    expect(announcement.status).toBe(PublicationStatus.DRAFT);

    // Enrolled student listing course announcements must not see draft
    const studentListBefore = await listAnnouncements(studentAContext, { courseId: course.id });
    expect(studentListBefore.items.some((a) => a.id === announcement.id)).toBe(false);

    // Lecturer publishes announcement
    const published = await publishAnnouncement(announcement.id, lecturerContext, {
      requestId: "req-ann-pub",
    });
    expect(published.status).toBe(PublicationStatus.PUBLISHED);

    // Enrolled student now sees announcement
    const studentListAfter = await listAnnouncements(studentAContext, { courseId: course.id });
    expect(studentListAfter.items.some((a) => a.id === announcement.id)).toBe(true);

    // Outside student cannot query course announcements for an un-enrolled course
    await expect(
      listAnnouncements(studentOutsideContext, { courseId: course.id })
    ).rejects.toThrow(/not enrolled/);
  });

  it("should automatically dispatch in-app notifications and support mark-as-read", async () => {
    // Check notifications for Student A (who was enrolled when announcement was published)
    const notifs = await listUserNotifications(studentAContext, {});
    expect(notifs.items.length).toBeGreaterThan(0);
    expect(notifs.unreadCount).toBeGreaterThan(0);

    const targetNotification = notifs.items[0];
    expect(targetNotification.isRead).toBe(false);

    // Mark as read
    const updatedNotif = await markNotificationAsRead(targetNotification.id, studentAContext);
    expect(updatedNotif.isRead).toBe(true);

    // Outside student should not have received this course notification
    const outsideNotifs = await listUserNotifications(studentOutsideContext, {});
    expect(outsideNotifs.items.some((n) => n.id === targetNotification.id)).toBe(false);
  });

  it("should support institutional announcements visible to all approved accounts", async () => {
    const instAnnouncement = await createAnnouncement(
      {
        title: "Campus Holiday Schedule",
        content: "NUTM campus will be observing the public holiday on Monday.",
      },
      adminContext,
      { requestId: "req-inst-ann" }
    );

    await publishAnnouncement(instAnnouncement.id, adminContext, {
      requestId: "req-inst-ann-pub",
    });

    // Both studentA and studentOutside should see the published institutional announcement in their global feed
    const studentAFeed = await listAnnouncements(studentAContext, {});
    const studentOutFeed = await listAnnouncements(studentOutsideContext, {});

    expect(studentAFeed.items.some((a) => a.id === instAnnouncement.id)).toBe(true);
    expect(studentOutFeed.items.some((a) => a.id === instAnnouncement.id)).toBe(true);
  });
});
