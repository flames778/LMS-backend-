import { prisma } from "@/lib/database/prisma";
import {
  PublicationStatus,
  MembershipType,
  LateSubmissionPolicy,
  ResubmissionPolicy,
  SubmissionStatus,
} from "@prisma/client";
import {
  NotFoundError,
  ForbiddenError,
  BadRequestError,
  ConflictError,
} from "@/lib/errors/api-error";
import { getStorageProvider } from "@/lib/storage/storage-provider";
import { recordAuditEvent } from "@/modules/audit/audit.service";
import { AuthenticatedContext } from "@/modules/auth/guard";
import { SystemRoles } from "@/modules/roles/roles.constants";

export async function listCourseAssignments(courseId: string, context: AuthenticatedContext) {
  const { user } = context;
  const isGlobalAdmin =
    user.roles.includes(SystemRoles.IT_ADMIN) ||
    user.roles.includes(SystemRoles.ACADEMIC_ADMIN);

  const membership = await prisma.courseMembership.findUnique({
    where: { courseId_userId: { courseId, userId: user.id } },
  });

  if (!isGlobalAdmin && (!membership || membership.status !== "ACTIVE")) {
    throw new ForbiddenError("You are not enrolled in this course");
  }

  const isLecturerOrAdmin =
    isGlobalAdmin || (membership && membership.membershipType === MembershipType.LECTURER);

  const where: Record<string, unknown> = { courseId };
  if (!isLecturerOrAdmin) {
    where.publicationStatus = PublicationStatus.PUBLISHED;
  }

  return await prisma.assignment.findMany({
    where,
    orderBy: { dueDate: "asc" },
    include: {
      creator: {
        select: {
          id: true,
          displayName: true,
          email: true,
        },
      },
      _count: {
        select: {
          submissions: true,
        },
      },
    },
  });
}

export async function getAssignmentById(assignmentId: string, context: AuthenticatedContext) {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: {
      course: true,
      creator: {
        select: {
          id: true,
          displayName: true,
          email: true,
        },
      },
    },
  });

  if (!assignment) throw new NotFoundError("Assignment not found");

  const { user } = context;
  const isGlobalAdmin =
    user.roles.includes(SystemRoles.IT_ADMIN) ||
    user.roles.includes(SystemRoles.ACADEMIC_ADMIN);

  const membership = await prisma.courseMembership.findUnique({
    where: { courseId_userId: { courseId: assignment.courseId, userId: user.id } },
  });

  if (!isGlobalAdmin && (!membership || membership.status !== "ACTIVE")) {
    throw new ForbiddenError("You are not enrolled in this course");
  }

  if (
    !isGlobalAdmin &&
    membership?.membershipType === MembershipType.STUDENT &&
    assignment.publicationStatus !== PublicationStatus.PUBLISHED
  ) {
    throw new NotFoundError("Assignment not found or not published");
  }

  return assignment;
}

export async function createAssignment(
  courseId: string,
  data: {
    title: string;
    instructions: string;
    availableFrom: Date;
    dueDate: Date;
    maximumMarks: number;
    acceptedFileTypes?: string;
    maxFileSizeBytes?: bigint;
    lateSubmissionPolicy?: LateSubmissionPolicy;
    resubmissionPolicy?: ResubmissionPolicy;
  },
  context: AuthenticatedContext,
  requestMetadata: { requestId: string; ipAddress?: string | null; userAgent?: string | null }
) {
  const { user } = context;
  const isGlobalAdmin =
    user.roles.includes(SystemRoles.IT_ADMIN) ||
    user.roles.includes(SystemRoles.ACADEMIC_ADMIN);

  const membership = await prisma.courseMembership.findUnique({
    where: { courseId_userId: { courseId, userId: user.id } },
  });

  if (!isGlobalAdmin && (!membership || membership.membershipType !== MembershipType.LECTURER)) {
    throw new ForbiddenError("Only assigned course lecturers or administrators can create assignments");
  }

  if (data.availableFrom >= data.dueDate) {
    throw new BadRequestError("Assignment available-from date must be strictly before due date");
  }

  if (data.maximumMarks <= 0) {
    throw new BadRequestError("Maximum marks must be greater than zero");
  }

  const assignment = await prisma.assignment.create({
    data: {
      courseId,
      creatorId: user.id,
      title: data.title.trim(),
      instructions: data.instructions,
      availableFrom: data.availableFrom,
      dueDate: data.dueDate,
      maximumMarks: data.maximumMarks,
      acceptedFileTypes: data.acceptedFileTypes || "application/pdf,application/zip",
      maxFileSizeBytes: data.maxFileSizeBytes || BigInt(52428800),
      lateSubmissionPolicy: data.lateSubmissionPolicy || LateSubmissionPolicy.ACCEPT_WITH_FLAG,
      resubmissionPolicy: data.resubmissionPolicy || ResubmissionPolicy.ALLOW_RESUBMISSION,
      publicationStatus: PublicationStatus.DRAFT,
    },
  });

  await recordAuditEvent({
    actorId: user.id,
    action: "ASSIGNMENT_CREATED",
    targetResourceType: "assignment",
    targetResourceId: assignment.id,
    outcome: "SUCCESS",
    requestId: requestMetadata.requestId,
    ipAddress: requestMetadata.ipAddress,
    userAgent: requestMetadata.userAgent,
    metadata: {
      courseId,
      dueDate: data.dueDate.toISOString(),
      maxMarks: data.maximumMarks,
    },
  });

  return assignment;
}

export async function publishAssignment(
  assignmentId: string,
  context: AuthenticatedContext,
  requestMetadata: { requestId: string; ipAddress?: string | null; userAgent?: string | null }
) {
  const assignment = await prisma.assignment.findUnique({ where: { id: assignmentId } });
  if (!assignment) throw new NotFoundError("Assignment not found");

  const { user } = context;
  const isGlobalAdmin =
    user.roles.includes(SystemRoles.IT_ADMIN) ||
    user.roles.includes(SystemRoles.ACADEMIC_ADMIN);

  const membership = await prisma.courseMembership.findUnique({
    where: { courseId_userId: { courseId: assignment.courseId, userId: user.id } },
  });

  if (!isGlobalAdmin && (!membership || membership.membershipType !== MembershipType.LECTURER)) {
    throw new ForbiddenError("Only assigned course lecturers or administrators can publish assignments");
  }

  const updated = await prisma.assignment.update({
    where: { id: assignmentId },
    data: { publicationStatus: PublicationStatus.PUBLISHED },
  });

  await recordAuditEvent({
    actorId: user.id,
    action: "ASSIGNMENT_PUBLISHED",
    targetResourceType: "assignment",
    targetResourceId: assignmentId,
    outcome: "SUCCESS",
    requestId: requestMetadata.requestId,
    ipAddress: requestMetadata.ipAddress,
    userAgent: requestMetadata.userAgent,
    metadata: { courseId: assignment.courseId },
  });

  return updated;
}

export async function submitAssignment(params: {
  assignmentId: string;
  fileName: string;
  contentType: string;
  fileBuffer: Buffer;
  submissionNotes?: string;
  context: AuthenticatedContext;
  requestId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const { user } = params.context;

  // 1. Fetch assignment
  const assignment = await prisma.assignment.findUnique({
    where: { id: params.assignmentId },
  });
  if (!assignment) throw new NotFoundError("Assignment not found");

  // 2. Verify publication status
  if (assignment.publicationStatus !== PublicationStatus.PUBLISHED) {
    throw new BadRequestError("Assignment is not open for submissions (unpublished)");
  }

  // 3. Confirm student course enrollment
  const membership = await prisma.courseMembership.findUnique({
    where: { courseId_userId: { courseId: assignment.courseId, userId: user.id } },
  });
  if (!membership || membership.status !== "ACTIVE" || membership.membershipType !== MembershipType.STUDENT) {
    throw new ForbiddenError("Only actively enrolled students in this course can submit assignments");
  }

  // 4. Server authoritative timestamp and deadline calculations
  const serverReceivedTimestamp = new Date();

  if (serverReceivedTimestamp < assignment.availableFrom) {
    throw new BadRequestError("This assignment is not yet open for submission");
  }

  const isLate = serverReceivedTimestamp > assignment.dueDate;
  if (isLate && assignment.lateSubmissionPolicy === LateSubmissionPolicy.REJECT) {
    throw new BadRequestError("The submission deadline has passed. Late submissions are not accepted.");
  }

  // 5. Enforce file size limit
  if (BigInt(params.fileBuffer.length) > assignment.maxFileSizeBytes) {
    throw new BadRequestError(
      `Uploaded file exceeds assignment maximum allowed size of ${assignment.maxFileSizeBytes} bytes`
    );
  }

  // 6. Check resubmission policy
  const existingSubmissions = await prisma.submission.findMany({
    where: { assignmentId: params.assignmentId, studentId: user.id },
    orderBy: { submissionVersion: "desc" },
  });

  if (
    existingSubmissions.length > 0 &&
    assignment.resubmissionPolicy === ResubmissionPolicy.SINGLE_SUBMISSION
  ) {
    throw new ConflictError("Resubmission is not permitted for this assignment.");
  }

  const nextVersion = existingSubmissions.length > 0 ? existingSubmissions[0].submissionVersion + 1 : 1;

  // 7. Store file via storage abstraction
  const storage = getStorageProvider();
  const saveResult = await storage.saveFile(
    `${assignment.id}-${user.id}-v${nextVersion}-${params.fileName}`,
    params.fileBuffer,
    params.contentType
  );

  // 8. Persist submission record with server-authoritative timestamp
  const submission = await prisma.submission.create({
    data: {
      assignmentId: params.assignmentId,
      studentId: user.id,
      submissionVersion: nextVersion,
      storageProvider: saveResult.storageProvider,
      storageObjectRef: saveResult.storageRef,
      fileName: params.fileName,
      contentType: params.contentType,
      fileSizeBytes: saveResult.fileSizeBytes,
      serverReceivedTimestamp,
      status: SubmissionStatus.SUBMITTED,
      isLate,
      submissionNotes: params.submissionNotes,
    },
  });

  await recordAuditEvent({
    actorId: user.id,
    action: "ASSIGNMENT_SUBMITTED",
    targetResourceType: "submission",
    targetResourceId: submission.id,
    outcome: "SUCCESS",
    requestId: params.requestId,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    metadata: {
      assignmentId: params.assignmentId,
      version: nextVersion,
      isLate,
      timestamp: serverReceivedTimestamp.toISOString(),
    },
  });

  return {
    receipt: {
      submissionId: submission.id,
      assignmentId: submission.assignmentId,
      studentId: submission.studentId,
      submissionVersion: submission.submissionVersion,
      serverReceivedTimestamp: submission.serverReceivedTimestamp,
      isLate: submission.isLate,
      status: submission.status,
      fileName: submission.fileName,
      fileSizeBytes: Number(submission.fileSizeBytes),
    },
  };
}

export async function getStudentSubmissions(assignmentId: string, context: AuthenticatedContext) {
  const { user } = context;
  return await prisma.submission.findMany({
    where: { assignmentId, studentId: user.id },
    orderBy: { submissionVersion: "desc" },
    select: {
      id: true,
      assignmentId: true,
      studentId: true,
      submissionVersion: true,
      fileName: true,
      contentType: true,
      fileSizeBytes: true,
      serverReceivedTimestamp: true,
      status: true,
      isLate: true,
      submissionNotes: true,
      createdAt: true,
      grades: {
        where: { releaseStatus: "RELEASED" },
        select: {
          awardedMarks: true,
          maximumMarks: true,
          feedback: true,
          createdAt: true,
        },
      },
    },
  });
}

export async function listAssignmentSubmissions(assignmentId: string, context: AuthenticatedContext) {
  const assignment = await prisma.assignment.findUnique({ where: { id: assignmentId } });
  if (!assignment) throw new NotFoundError("Assignment not found");

  const { user } = context;
  const isGlobalAdmin =
    user.roles.includes(SystemRoles.IT_ADMIN) ||
    user.roles.includes(SystemRoles.ACADEMIC_ADMIN);

  const membership = await prisma.courseMembership.findUnique({
    where: { courseId_userId: { courseId: assignment.courseId, userId: user.id } },
  });

  if (!isGlobalAdmin && (!membership || membership.membershipType !== MembershipType.LECTURER)) {
    throw new ForbiddenError("Only assigned course lecturers or administrators can view all student submissions");
  }

  return await prisma.submission.findMany({
    where: { assignmentId },
    orderBy: [{ studentId: "asc" }, { submissionVersion: "desc" }],
    include: {
      student: {
        select: {
          id: true,
          displayName: true,
          email: true,
        },
      },
      grades: {
        select: {
          id: true,
          awardedMarks: true,
          maximumMarks: true,
          feedback: true,
          releaseStatus: true,
        },
      },
    },
  });
}

export async function getSubmissionById(submissionId: string, context: AuthenticatedContext) {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      assignment: true,
      student: {
        select: {
          id: true,
          displayName: true,
          email: true,
        },
      },
      grades: {
        select: {
          id: true,
          awardedMarks: true,
          maximumMarks: true,
          feedback: true,
          releaseStatus: true,
        },
      },
    },
  });

  if (!submission) throw new NotFoundError("Submission not found");

  const { user } = context;
  const isOwner = submission.studentId === user.id;
  const isGlobalAdmin =
    user.roles.includes(SystemRoles.IT_ADMIN) ||
    user.roles.includes(SystemRoles.ACADEMIC_ADMIN);

  const membership = await prisma.courseMembership.findUnique({
    where: { courseId_userId: { courseId: submission.assignment.courseId, userId: user.id } },
  });

  const isAssignedLecturer = membership?.membershipType === MembershipType.LECTURER;

  // IDOR Protection: Students cannot view other students' submissions
  if (!isOwner && !isGlobalAdmin && !isAssignedLecturer) {
    throw new ForbiddenError("You do not have permission to view this submission");
  }

  // Sanitize unreleased grades for students
  if (isOwner && !isGlobalAdmin && !isAssignedLecturer) {
    submission.grades = submission.grades.filter((g) => g.releaseStatus === "RELEASED");
  }

  return submission;
}

export async function getSubmissionFile(submissionId: string, context: AuthenticatedContext) {
  const submission = await getSubmissionById(submissionId, context);

  const storage = getStorageProvider();
  const buffer = await storage.getFileBuffer(submission.storageObjectRef);

  return {
    buffer,
    fileName: submission.fileName,
    contentType: submission.contentType,
  };
}
