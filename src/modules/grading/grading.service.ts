import { prisma } from "@/lib/database/prisma";
import { GradeReleaseStatus, MembershipType, SubmissionStatus } from "@prisma/client";
import { NotFoundError, ForbiddenError, BadRequestError } from "@/lib/errors/api-error";
import { recordAuditEvent } from "@/modules/audit/audit.service";
import { AuthenticatedContext } from "@/modules/auth/guard";
import { SystemRoles } from "@/modules/roles/roles.constants";

export async function gradeSubmission(
  submissionId: string,
  data: {
    awardedMarks: number;
    maximumMarks: number;
    feedback?: string;
  },
  context: AuthenticatedContext,
  requestMetadata: { requestId: string; ipAddress?: string | null; userAgent?: string | null }
) {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: { assignment: true },
  });
  if (!submission) throw new NotFoundError("Submission not found");

  const { user } = context;
  const isGlobalAdmin =
    user.roles.includes(SystemRoles.IT_ADMIN) ||
    user.roles.includes(SystemRoles.ACADEMIC_ADMIN);

  const membership = await prisma.courseMembership.findUnique({
    where: { courseId_userId: { courseId: submission.assignment.courseId, userId: user.id } },
  });

  if (!isGlobalAdmin && (!membership || membership.membershipType !== MembershipType.LECTURER)) {
    throw new ForbiddenError("Only assigned course lecturers can grade submissions");
  }

  if (data.awardedMarks < 0 || data.awardedMarks > data.maximumMarks) {
    throw new BadRequestError(
      `Awarded marks (${data.awardedMarks}) must be between 0 and maximum possible marks (${data.maximumMarks})`
    );
  }

  const grade = await prisma.$transaction(async (tx) => {
    const existing = await tx.grade.findFirst({
      where: { submissionId, studentId: submission.studentId },
    });

    let savedGrade;
    if (existing) {
      savedGrade = await tx.grade.update({
        where: { id: existing.id },
        data: {
          awardedMarks: data.awardedMarks,
          maximumMarks: data.maximumMarks,
          feedback: data.feedback,
          graderId: user.id,
        },
      });
    } else {
      savedGrade = await tx.grade.create({
        data: {
          assignmentId: submission.assignmentId,
          submissionId,
          studentId: submission.studentId,
          graderId: user.id,
          awardedMarks: data.awardedMarks,
          maximumMarks: data.maximumMarks,
          feedback: data.feedback,
          releaseStatus: GradeReleaseStatus.UNRELEASED,
        },
      });
    }

    await tx.submission.update({
      where: { id: submissionId },
      data: { status: SubmissionStatus.GRADED },
    });

    return savedGrade;
  });

  await recordAuditEvent({
    actorId: user.id,
    action: "SUBMISSION_GRADED",
    targetResourceType: "grade",
    targetResourceId: grade.id,
    outcome: "SUCCESS",
    requestId: requestMetadata.requestId,
    ipAddress: requestMetadata.ipAddress,
    userAgent: requestMetadata.userAgent,
    metadata: {
      submissionId,
      awardedMarks: data.awardedMarks,
      maximumMarks: data.maximumMarks,
    },
  });

  return grade;
}

export async function amendGrade(
  gradeId: string,
  data: {
    newMarks: number;
    newFeedback?: string;
    changeReason: string;
  },
  context: AuthenticatedContext,
  requestMetadata: { requestId: string; ipAddress?: string | null; userAgent?: string | null }
) {
  const grade = await prisma.grade.findUnique({
    where: { id: gradeId },
    include: { assignment: true, assessment: true },
  });
  if (!grade) throw new NotFoundError("Grade record not found");

  const courseId = grade.assignment?.courseId || grade.assessment?.courseId;
  const { user } = context;
  const isGlobalAdmin =
    user.roles.includes(SystemRoles.IT_ADMIN) ||
    user.roles.includes(SystemRoles.ACADEMIC_ADMIN);

  if (courseId) {
    const membership = await prisma.courseMembership.findUnique({
      where: { courseId_userId: { courseId, userId: user.id } },
    });
    if (!isGlobalAdmin && (!membership || membership.membershipType !== MembershipType.LECTURER)) {
      throw new ForbiddenError("Only assigned course lecturers can amend grades");
    }
  }

  if (data.newMarks < 0 || data.newMarks > grade.maximumMarks) {
    throw new BadRequestError(`New marks must be between 0 and ${grade.maximumMarks}`);
  }

  const result = await prisma.$transaction(async (tx) => {
    // Record immutable audit history
    await tx.gradeAudit.create({
      data: {
        gradeId,
        actorId: user.id,
        previousMarks: grade.awardedMarks,
        newMarks: data.newMarks,
        previousFeedback: grade.feedback,
        newFeedback: data.newFeedback !== undefined ? data.newFeedback : grade.feedback,
        changeReason: data.changeReason,
      },
    });

    const updated = await tx.grade.update({
      where: { id: gradeId },
      data: {
        awardedMarks: data.newMarks,
        feedback: data.newFeedback !== undefined ? data.newFeedback : grade.feedback,
      },
    });

    return updated;
  });

  await recordAuditEvent({
    actorId: user.id,
    action: "GRADE_AMENDED",
    targetResourceType: "grade",
    targetResourceId: gradeId,
    outcome: "SUCCESS",
    requestId: requestMetadata.requestId,
    ipAddress: requestMetadata.ipAddress,
    userAgent: requestMetadata.userAgent,
    metadata: {
      previousMarks: grade.awardedMarks,
      newMarks: data.newMarks,
      changeReason: data.changeReason,
    },
  });

  return result;
}

export async function releaseGrade(
  gradeId: string,
  context: AuthenticatedContext,
  requestMetadata: { requestId: string; ipAddress?: string | null; userAgent?: string | null }
) {
  const grade = await prisma.grade.findUnique({
    where: { id: gradeId },
    include: { assignment: true, assessment: true },
  });
  if (!grade) throw new NotFoundError("Grade record not found");

  const courseId = grade.assignment?.courseId || grade.assessment?.courseId;
  const { user } = context;
  const isGlobalAdmin =
    user.roles.includes(SystemRoles.IT_ADMIN) ||
    user.roles.includes(SystemRoles.ACADEMIC_ADMIN);

  if (courseId) {
    const membership = await prisma.courseMembership.findUnique({
      where: { courseId_userId: { courseId, userId: user.id } },
    });
    if (!isGlobalAdmin && (!membership || membership.membershipType !== MembershipType.LECTURER)) {
      throw new ForbiddenError("Only assigned course lecturers can release grades");
    }
  }

  const updated = await prisma.grade.update({
    where: { id: gradeId },
    data: { releaseStatus: GradeReleaseStatus.RELEASED },
  });

  await recordAuditEvent({
    actorId: user.id,
    action: "GRADE_RELEASED",
    targetResourceType: "grade",
    targetResourceId: gradeId,
    outcome: "SUCCESS",
    requestId: requestMetadata.requestId,
    ipAddress: requestMetadata.ipAddress,
    userAgent: requestMetadata.userAgent,
  });

  return updated;
}

export async function getStudentGrades(context: AuthenticatedContext) {
  const { user } = context;

  // Strict privacy rule: Student only sees RELEASED grades
  return await prisma.grade.findMany({
    where: {
      studentId: user.id,
      releaseStatus: GradeReleaseStatus.RELEASED,
    },
    orderBy: { createdAt: "desc" },
    include: {
      assignment: {
        select: {
          id: true,
          title: true,
          course: {
            select: {
              courseCode: true,
              courseTitle: true,
            },
          },
        },
      },
      assessment: {
        select: {
          id: true,
          title: true,
          course: {
            select: {
              courseCode: true,
              courseTitle: true,
            },
          },
        },
      },
      grader: {
        select: {
          id: true,
          displayName: true,
        },
      },
    },
  });
}
