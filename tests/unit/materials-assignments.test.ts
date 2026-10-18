import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/database/prisma";
import {
  uploadMaterial,
  publishMaterial,
  listCourseMaterials,
  getMaterialFile,
} from "@/modules/materials/materials.service";
import {
  createAssignment,
  publishAssignment,
  submitAssignment,
  getSubmissionById,
} from "@/modules/assignments/assignments.service";
import { seedDatabase } from "@/scripts/seed-admin";
import { SystemRoles, SystemPermissions } from "@/modules/roles/roles.constants";
import {
  AccountStatus,
  MembershipType,
  LateSubmissionPolicy,
  ResubmissionPolicy,
} from "@prisma/client";
import { AuthenticatedContext } from "@/modules/auth/guard";

describe("Phase 4: Materials, Assignments, and Submissions", () => {
  let lecturerContext: AuthenticatedContext;
  let studentAContext: AuthenticatedContext;
  let studentBContext: AuthenticatedContext;
  let course: any;

  beforeAll(async () => {
    // Clean up
    await prisma.course.deleteMany({ where: { courseCode: "MAT101" } });
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            "lecturer.mat@nutm.edu.ng",
            "student.a@nutm.edu.ng",
            "student.b@nutm.edu.ng",
          ],
        },
      },
    });

    // 1. Create lecturer
    const lecturer = await prisma.user.create({
      data: {
        email: "lecturer.mat@nutm.edu.ng",
        displayName: "Dr. Matthew",
        entraTenantId: "nutm-tenant-test",
        entraObjectId: "lecturer-mat-oid",
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
        permissions: [
          SystemPermissions.MATERIALS_UPLOAD,
          SystemPermissions.MATERIALS_PUBLISH,
          SystemPermissions.ASSIGNMENTS_CREATE,
          SystemPermissions.ASSIGNMENTS_PUBLISH,
        ],
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

    // 2. Create Student A
    const studentA = await prisma.user.create({
      data: {
        email: "student.a@nutm.edu.ng",
        displayName: "Student Alpha",
        entraTenantId: "nutm-tenant-test",
        entraObjectId: "student-a-oid",
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
        permissions: [SystemPermissions.MATERIALS_READ, SystemPermissions.SUBMISSIONS_CREATE],
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

    // 3. Create Student B
    const studentB = await prisma.user.create({
      data: {
        email: "student.b@nutm.edu.ng",
        displayName: "Student Beta",
        entraTenantId: "nutm-tenant-test",
        entraObjectId: "student-b-oid",
        accountStatus: AccountStatus.APPROVED,
      },
    });
    studentBContext = {
      user: {
        id: studentB.id,
        email: studentB.email,
        displayName: studentB.displayName,
        accountStatus: studentB.accountStatus,
        entraTenantId: studentB.entraTenantId,
        entraObjectId: studentB.entraObjectId,
        roles: [SystemRoles.STUDENT],
        permissions: [SystemPermissions.MATERIALS_READ, SystemPermissions.SUBMISSIONS_CREATE],
      },
      session: {
        userId: studentB.id,
        email: studentB.email,
        displayName: studentB.displayName,
        roles: [SystemRoles.STUDENT],
        accountStatus: "APPROVED",
        entraTenantId: studentB.entraTenantId,
        entraObjectId: studentB.entraObjectId,
      },
    };

    // 4. Create Course
    course = await prisma.course.create({
      data: {
        courseCode: "MAT101",
        courseTitle: "Materials & Mechanics",
        academicTerm: "2026-Fall",
      },
    });

    // Enrol Lecturer and Students
    await prisma.courseMembership.createMany({
      data: [
        { courseId: course.id, userId: lecturer.id, membershipType: MembershipType.LECTURER },
        { courseId: course.id, userId: studentA.id, membershipType: MembershipType.STUDENT },
        { courseId: course.id, userId: studentB.id, membershipType: MembershipType.STUDENT },
      ],
    });
  });

  it("should upload material as DRAFT and hide from students until published", async () => {
    const materialBuffer = Buffer.from("Lecture 1: Introduction to Mechanics", "utf8");

    const material = await uploadMaterial({
      courseId: course.id,
      title: "Lecture 1 Notes",
      fileName: "lecture1.pdf",
      contentType: "application/pdf",
      fileBuffer: materialBuffer,
      context: lecturerContext,
      requestId: "req-mat-1",
    });

    expect(material.publicationStatus).toBe("DRAFT");

    // Student listing materials must NOT see draft material
    const studentMaterials = await listCourseMaterials(course.id, studentAContext);
    expect(studentMaterials.some((m) => m.id === material.id)).toBe(false);

    // Student attempting to download draft must receive NotFoundError
    await expect(getMaterialFile(material.id, studentAContext)).rejects.toThrow(/not yet published/);

    // Lecturer publishes material
    const published = await publishMaterial(material.id, lecturerContext, {
      requestId: "req-pub-mat",
    });
    expect(published.publicationStatus).toBe("PUBLISHED");

    // Student now sees published material and can download
    const studentMaterialsAfter = await listCourseMaterials(course.id, studentAContext);
    expect(studentMaterialsAfter.some((m) => m.id === material.id)).toBe(true);

    const downloaded = await getMaterialFile(material.id, studentAContext);
    expect(downloaded.buffer.toString("utf8")).toBe("Lecture 1: Introduction to Mechanics");
  });

  it("should process assignment submission with server-authoritative timestamps", async () => {
    // Create published assignment due tomorrow
    const availableFrom = new Date(Date.now() - 3600000); // 1 hour ago
    const dueDate = new Date(Date.now() + 86400000); // 24 hours from now

    const assignment = await createAssignment(
      course.id,
      {
        title: "Problem Set 1",
        instructions: "Solve problems 1 through 5",
        availableFrom,
        dueDate,
        maximumMarks: 100,
        lateSubmissionPolicy: LateSubmissionPolicy.REJECT,
        resubmissionPolicy: ResubmissionPolicy.ALLOW_RESUBMISSION,
      },
      lecturerContext,
      { requestId: "req-asg-1" }
    );

    await publishAssignment(assignment.id, lecturerContext, { requestId: "req-asg-pub" });

    const submissionFile = Buffer.from("Student Alpha answers: Problem 1 = 42", "utf8");

    // Student A submits work
    const submissionResult = await submitAssignment({
      assignmentId: assignment.id,
      fileName: "solution.pdf",
      contentType: "application/pdf",
      fileBuffer: submissionFile,
      context: studentAContext,
      requestId: "req-sub-1",
    });

    expect(submissionResult.receipt.submissionVersion).toBe(1);
    expect(submissionResult.receipt.isLate).toBe(false);
    expect(submissionResult.receipt.serverReceivedTimestamp).toBeDefined();

    // Student A resubmits (new version 2)
    const resubmissionFile = Buffer.from("Student Alpha updated answers: Problem 1 = 42.5", "utf8");
    const resubmissionResult = await submitAssignment({
      assignmentId: assignment.id,
      fileName: "solution_v2.pdf",
      contentType: "application/pdf",
      fileBuffer: resubmissionFile,
      context: studentAContext,
      requestId: "req-sub-2",
    });

    expect(resubmissionResult.receipt.submissionVersion).toBe(2);
    expect(resubmissionResult.receipt.isLate).toBe(false);

    // Verify version 1 is still preserved in database
    const allVersions = await prisma.submission.findMany({
      where: { assignmentId: assignment.id, studentId: studentAContext.user.id },
      orderBy: { submissionVersion: "asc" },
    });
    expect(allVersions.length).toBe(2);
    expect(allVersions[0].submissionVersion).toBe(1);
    expect(allVersions[1].submissionVersion).toBe(2);
  });

  it("should enforce IDOR security: Student B cannot view Student A's submission", async () => {
    const studentASubmission = await prisma.submission.findFirstOrThrow({
      where: { studentId: studentAContext.user.id },
    });

    // Student A can view own submission
    const studentAView = await getSubmissionById(studentASubmission.id, studentAContext);
    expect(studentAView.id).toBe(studentASubmission.id);

    // Student B attempting to view Student A's submission must be denied
    await expect(getSubmissionById(studentASubmission.id, studentBContext)).rejects.toThrow(
      /permission/
    );
  });

  it("should enforce late submission policies strictly on the server", async () => {
    // Create assignment whose deadline has already passed
    const pastAvailable = new Date(Date.now() - 7200000); // 2 hours ago
    const pastDue = new Date(Date.now() - 3600000); // 1 hour ago

    // Case 1: REJECT policy
    const strictAssignment = await createAssignment(
      course.id,
      {
        title: "Strict Deadline Quiz",
        instructions: "Late work rejected",
        availableFrom: pastAvailable,
        dueDate: pastDue,
        maximumMarks: 50,
        lateSubmissionPolicy: LateSubmissionPolicy.REJECT,
      },
      lecturerContext,
      { requestId: "req-strict-asg" }
    );
    await publishAssignment(strictAssignment.id, lecturerContext, { requestId: "req-strict-pub" });

    const submissionFile = Buffer.from("Late submission content", "utf8");
    await expect(
      submitAssignment({
        assignmentId: strictAssignment.id,
        fileName: "late.pdf",
        contentType: "application/pdf",
        fileBuffer: submissionFile,
        context: studentAContext,
        requestId: "req-late-1",
      })
    ).rejects.toThrow(/deadline has passed/);

    // Case 2: ACCEPT_WITH_FLAG policy
    const lenientAssignment = await createAssignment(
      course.id,
      {
        title: "Lenient Deadline Assignment",
        instructions: "Late work accepted with flag",
        availableFrom: pastAvailable,
        dueDate: pastDue,
        maximumMarks: 50,
        lateSubmissionPolicy: LateSubmissionPolicy.ACCEPT_WITH_FLAG,
      },
      lecturerContext,
      { requestId: "req-lenient-asg" }
    );
    await publishAssignment(lenientAssignment.id, lecturerContext, { requestId: "req-lenient-pub" });

    const lenientSubmission = await submitAssignment({
      assignmentId: lenientAssignment.id,
      fileName: "late_ok.pdf",
      contentType: "application/pdf",
      fileBuffer: submissionFile,
      context: studentAContext,
      requestId: "req-late-2",
    });

    expect(lenientSubmission.receipt.isLate).toBe(true);
  });
});
