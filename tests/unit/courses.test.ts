import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/database/prisma";
import { createSessionToken } from "@/lib/security/session";
import {
  createCourse,
  listCourses,
  getCourseById,
  addCourseMember,
  updateCourse,
  archiveCourse,
} from "@/modules/courses/courses.service";
import { seedDatabase } from "@/scripts/seed-admin";
import { SystemRoles, SystemPermissions } from "@/modules/roles/roles.constants";
import { AccountStatus, MembershipType, CourseStatus } from "@prisma/client";
import { AuthenticatedContext } from "@/modules/auth/guard";

describe("Phase 3: Courses and Enrolments", () => {
  let adminContext: AuthenticatedContext;
  let lecturerUser: any;
  let studentUser1: any;
  let studentUser2: any;
  let course1: any;

  beforeAll(async () => {
    // Clean up test courses and users
    await prisma.course.deleteMany({
      where: {
        courseCode: { in: ["CS101", "BUS201"] },
      },
    });

    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            "admin.courses@nutm.edu.ng",
            "prof.ada@nutm.edu.ng",
            "student1@nutm.edu.ng",
            "student2@nutm.edu.ng",
          ],
        },
      },
    });

    const admin = await seedDatabase("admin.courses@nutm.edu.ng", "nutm-tenant-test");
    adminContext = {
      user: {
        id: admin.id,
        email: admin.email,
        displayName: admin.displayName,
        accountStatus: admin.accountStatus,
        entraTenantId: admin.entraTenantId,
        entraObjectId: admin.entraObjectId,
        roles: [SystemRoles.IT_ADMIN],
        permissions: [
          SystemPermissions.COURSES_CREATE,
          SystemPermissions.COURSES_UPDATE,
          SystemPermissions.COURSES_ARCHIVE,
          SystemPermissions.ENROLMENTS_MANAGE,
          SystemPermissions.COURSES_READ,
        ],
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

    // Create a lecturer
    lecturerUser = await prisma.user.create({
      data: {
        email: "prof.ada@nutm.edu.ng",
        displayName: "Prof Ada",
        entraTenantId: "nutm-tenant-test",
        entraObjectId: "ada-oid-999",
        accountStatus: AccountStatus.APPROVED,
      },
    });

    // Create 2 students
    studentUser1 = await prisma.user.create({
      data: {
        email: "student1@nutm.edu.ng",
        displayName: "Student One",
        entraTenantId: "nutm-tenant-test",
        entraObjectId: "stud1-oid",
        accountStatus: AccountStatus.APPROVED,
      },
    });

    studentUser2 = await prisma.user.create({
      data: {
        email: "student2@nutm.edu.ng",
        displayName: "Student Two",
        entraTenantId: "nutm-tenant-test",
        entraObjectId: "stud2-oid",
        accountStatus: AccountStatus.APPROVED,
      },
    });
  });

  it("should create a new course and enforce uniqueness on course code and academic term", async () => {
    course1 = await createCourse(
      {
        courseCode: "CS101",
        courseTitle: "Introduction to Computer Science",
        academicTerm: "2026-Fall",
        description: "Foundations of programming and computer architecture",
      },
      adminContext.user.id,
      { requestId: "req-c1" }
    );

    expect(course1.courseCode).toBe("CS101");
    expect(course1.status).toBe(CourseStatus.ACTIVE);

    // Duplicate creation must fail with ConflictError
    await expect(
      createCourse(
        {
          courseCode: "CS101",
          courseTitle: "Duplicate CS101",
          academicTerm: "2026-Fall",
        },
        adminContext.user.id,
        { requestId: "req-dup-c" }
      )
    ).rejects.toThrow(/already exists/);
  });

  it("should enrol lecturer and student into the course", async () => {
    const lecturerEnrollment = await addCourseMember(
      course1.id,
      { userId: lecturerUser.id, membershipType: MembershipType.LECTURER },
      adminContext.user.id,
      { requestId: "req-enrol-1" }
    );
    expect(lecturerEnrollment.membershipType).toBe(MembershipType.LECTURER);

    const studentEnrollment = await addCourseMember(
      course1.id,
      { userId: studentUser1.id, membershipType: MembershipType.STUDENT },
      adminContext.user.id,
      { requestId: "req-enrol-2" }
    );
    expect(studentEnrollment.membershipType).toBe(MembershipType.STUDENT);
  });

  it("should enforce scoped course visibility (student only sees enrolled courses)", async () => {
    // Create another course that student1 is NOT enrolled in
    const course2 = await createCourse(
      {
        courseCode: "BUS201",
        courseTitle: "Technology Strategy",
        academicTerm: "2026-Fall",
      },
      adminContext.user.id,
      { requestId: "req-c2" }
    );

    const student1Context: AuthenticatedContext = {
      user: {
        id: studentUser1.id,
        email: studentUser1.email,
        displayName: studentUser1.displayName,
        accountStatus: AccountStatus.APPROVED,
        entraTenantId: "nutm-tenant-test",
        entraObjectId: "stud1-oid",
        roles: [SystemRoles.STUDENT],
        permissions: [SystemPermissions.COURSES_READ],
      },
      session: {
        userId: studentUser1.id,
        email: studentUser1.email,
        displayName: studentUser1.displayName,
        roles: [SystemRoles.STUDENT],
        accountStatus: "APPROVED",
        entraTenantId: "nutm-tenant-test",
        entraObjectId: "stud1-oid",
      },
    };

    const studentCourses = await listCourses(student1Context, {});
    expect(studentCourses.items.length).toBe(1);
    expect(studentCourses.items[0].courseCode).toBe("CS101");

    // Student1 querying BUS201 directly must be rejected with ForbiddenError
    await expect(getCourseById(course2.id, student1Context)).rejects.toThrow(/not enrolled/);
  });

  it("should update and archive course with audit trail", async () => {
    const updated = await updateCourse(
      course1.id,
      { courseTitle: "Introduction to Computer Science & Python" },
      adminContext.user.id,
      { requestId: "req-up-c" }
    );
    expect(updated.courseTitle).toBe("Introduction to Computer Science & Python");

    const archived = await archiveCourse(course1.id, adminContext.user.id, {
      requestId: "req-arch-c",
    });
    expect(archived.status).toBe(CourseStatus.ARCHIVED);

    const auditLog = await prisma.auditLog.findFirst({
      where: { targetResourceId: course1.id, action: "COURSE_ARCHIVED" },
    });
    expect(auditLog).toBeDefined();
  });
});
