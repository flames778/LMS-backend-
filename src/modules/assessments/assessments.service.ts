import { prisma } from "@/lib/database/prisma";
import {
  PublicationStatus,
  MembershipType,
  QuestionType,
  AttemptStatus,
  GradingStatus,
} from "@prisma/client";
import {
  NotFoundError,
  ForbiddenError,
  BadRequestError,
  ConflictError,
} from "@/lib/errors/api-error";
import { recordAuditEvent } from "@/modules/audit/audit.service";
import { AuthenticatedContext } from "@/modules/auth/guard";
import { SystemRoles } from "@/modules/roles/roles.constants";

export async function listCourseAssessments(courseId: string, context: AuthenticatedContext) {
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

  return await prisma.assessment.findMany({
    where,
    orderBy: { availableFrom: "asc" },
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
          questions: true,
          attempts: true,
        },
      },
    },
  });
}

export async function createAssessment(
  courseId: string,
  data: {
    title: string;
    description?: string;
    durationMinutes: number;
    attemptLimit?: number;
    availableFrom: Date;
    availableUntil: Date;
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
    throw new ForbiddenError("Only assigned course lecturers or administrators can create assessments");
  }

  if (data.durationMinutes <= 0) {
    throw new BadRequestError("Duration must be at least 1 minute");
  }

  if (data.availableFrom >= data.availableUntil) {
    throw new BadRequestError("Available-from date must precede available-until date");
  }

  const assessment = await prisma.assessment.create({
    data: {
      courseId,
      creatorId: user.id,
      title: data.title.trim(),
      description: data.description,
      durationMinutes: data.durationMinutes,
      attemptLimit: data.attemptLimit || 1,
      availableFrom: data.availableFrom,
      availableUntil: data.availableUntil,
      publicationStatus: PublicationStatus.DRAFT,
    },
  });

  await recordAuditEvent({
    actorId: user.id,
    action: "ASSESSMENT_CREATED",
    targetResourceType: "assessment",
    targetResourceId: assessment.id,
    outcome: "SUCCESS",
    requestId: requestMetadata.requestId,
    ipAddress: requestMetadata.ipAddress,
    userAgent: requestMetadata.userAgent,
    metadata: {
      courseId,
      durationMinutes: data.durationMinutes,
      attemptLimit: assessment.attemptLimit,
    },
  });

  return assessment;
}

export async function addAssessmentQuestion(
  assessmentId: string,
  data: {
    questionText: string;
    questionType: QuestionType;
    options: string[];
    correctAnswers: string[];
    marks: number;
    explanation?: string;
  },
  context: AuthenticatedContext,
  requestMetadata: { requestId: string; ipAddress?: string | null; userAgent?: string | null }
) {
  const assessment = await prisma.assessment.findUnique({ where: { id: assessmentId } });
  if (!assessment) throw new NotFoundError("Assessment not found");

  const { user } = context;
  const isGlobalAdmin =
    user.roles.includes(SystemRoles.IT_ADMIN) ||
    user.roles.includes(SystemRoles.ACADEMIC_ADMIN);

  const membership = await prisma.courseMembership.findUnique({
    where: { courseId_userId: { courseId: assessment.courseId, userId: user.id } },
  });

  if (!isGlobalAdmin && (!membership || membership.membershipType !== MembershipType.LECTURER)) {
    throw new ForbiddenError("Only assigned course lecturers can add questions");
  }

  const count = await prisma.assessmentQuestion.count({ where: { assessmentId } });

  const question = await prisma.assessmentQuestion.create({
    data: {
      assessmentId,
      questionOrder: count + 1,
      questionText: data.questionText,
      questionType: data.questionType,
      options: JSON.stringify(data.options),
      correctAnswers: JSON.stringify(data.correctAnswers),
      marks: data.marks,
      explanation: data.explanation,
    },
  });

  await recordAuditEvent({
    actorId: user.id,
    action: "ASSESSMENT_QUESTION_ADDED",
    targetResourceType: "assessment_question",
    targetResourceId: question.id,
    outcome: "SUCCESS",
    requestId: requestMetadata.requestId,
    ipAddress: requestMetadata.ipAddress,
    userAgent: requestMetadata.userAgent,
    metadata: { assessmentId, questionOrder: question.questionOrder },
  });

  return question;
}

export async function publishAssessment(
  assessmentId: string,
  context: AuthenticatedContext,
  requestMetadata: { requestId: string; ipAddress?: string | null; userAgent?: string | null }
) {
  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    include: { questions: true },
  });
  if (!assessment) throw new NotFoundError("Assessment not found");

  if (assessment.questions.length === 0) {
    throw new BadRequestError("Cannot publish an assessment with zero questions");
  }

  const { user } = context;
  const isGlobalAdmin =
    user.roles.includes(SystemRoles.IT_ADMIN) ||
    user.roles.includes(SystemRoles.ACADEMIC_ADMIN);

  const membership = await prisma.courseMembership.findUnique({
    where: { courseId_userId: { courseId: assessment.courseId, userId: user.id } },
  });

  if (!isGlobalAdmin && (!membership || membership.membershipType !== MembershipType.LECTURER)) {
    throw new ForbiddenError("Only assigned course lecturers can publish assessments");
  }

  const updated = await prisma.assessment.update({
    where: { id: assessmentId },
    data: { publicationStatus: PublicationStatus.PUBLISHED },
  });

  await recordAuditEvent({
    actorId: user.id,
    action: "ASSESSMENT_PUBLISHED",
    targetResourceType: "assessment",
    targetResourceId: assessmentId,
    outcome: "SUCCESS",
    requestId: requestMetadata.requestId,
    ipAddress: requestMetadata.ipAddress,
    userAgent: requestMetadata.userAgent,
    metadata: { courseId: assessment.courseId },
  });

  return updated;
}

export async function getAssessmentForStudent(assessmentId: string, context: AuthenticatedContext) {
  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    include: {
      questions: {
        orderBy: { questionOrder: "asc" },
        select: {
          id: true,
          assessmentId: true,
          questionOrder: true,
          questionText: true,
          questionType: true,
          options: true,
          marks: true,
          // CRITICAL: correctAnswers and explanation are intentionally EXCLUDED here!
        },
      },
    },
  });

  if (!assessment) throw new NotFoundError("Assessment not found");

  const { user } = context;
  const isGlobalAdmin =
    user.roles.includes(SystemRoles.IT_ADMIN) ||
    user.roles.includes(SystemRoles.ACADEMIC_ADMIN);

  const membership = await prisma.courseMembership.findUnique({
    where: { courseId_userId: { courseId: assessment.courseId, userId: user.id } },
  });

  if (!isGlobalAdmin && (!membership || membership.status !== "ACTIVE")) {
    throw new ForbiddenError("You are not enrolled in this course");
  }

  return {
    ...assessment,
    questions: assessment.questions.map((q) => ({
      ...q,
      options: JSON.parse(q.options),
    })),
  };
}

export async function startAssessmentAttempt(
  assessmentId: string,
  context: AuthenticatedContext,
  requestMetadata: { requestId: string; ipAddress?: string | null; userAgent?: string | null }
) {
  const { user } = context;

  const result = await prisma.$transaction(async (tx) => {
    const assessment = await tx.assessment.findUnique({
      where: { id: assessmentId },
      include: {
        questions: {
          select: {
            id: true,
            questionOrder: true,
            questionText: true,
            questionType: true,
            options: true,
            marks: true,
          },
        },
      },
    });

    if (!assessment) throw new NotFoundError("Assessment not found");

    if (assessment.publicationStatus !== PublicationStatus.PUBLISHED) {
      throw new BadRequestError("Assessment is not published or open for attempts");
    }

    const membership = await tx.courseMembership.findUnique({
      where: { courseId_userId: { courseId: assessment.courseId, userId: user.id } },
    });
    if (!membership || membership.status !== "ACTIVE" || membership.membershipType !== MembershipType.STUDENT) {
      throw new ForbiddenError("Only actively enrolled students in this course can take assessments");
    }

    const now = new Date();
    if (now < assessment.availableFrom) {
      throw new BadRequestError("Assessment window has not yet opened");
    }
    if (now > assessment.availableUntil) {
      throw new BadRequestError("Assessment window has closed");
    }

    // Check existing attempts
    const existingAttempts = await tx.assessmentAttempt.findMany({
      where: { assessmentId, studentId: user.id },
      orderBy: { attemptNumber: "desc" },
    });

    if (existingAttempts.length >= assessment.attemptLimit) {
      throw new ConflictError(`Maximum attempt limit (${assessment.attemptLimit}) reached for this assessment`);
    }

    // Any open in-progress attempt?
    const activeAttempt = existingAttempts.find((a) => a.attemptStatus === AttemptStatus.IN_PROGRESS);
    if (activeAttempt) {
      // If deadline has passed, expire it
      if (now > activeAttempt.authoritativeDeadline) {
        await tx.assessmentAttempt.update({
          where: { id: activeAttempt.id },
          data: { attemptStatus: AttemptStatus.EXPIRED },
        });
      } else {
        // Return existing active attempt rather than creating duplicate
        return { attempt: activeAttempt, isResumed: true, assessment };
      }
    }

    const nextAttemptNumber = existingAttempts.length + 1;
    const durationMs = assessment.durationMinutes * 60 * 1000;
    const computedDeadline = new Date(now.getTime() + durationMs);

    // Authoritative deadline cannot exceed availableUntil window
    const authoritativeDeadline =
      computedDeadline > assessment.availableUntil ? assessment.availableUntil : computedDeadline;

    const newAttempt = await tx.assessmentAttempt.create({
      data: {
        assessmentId,
        studentId: user.id,
        attemptNumber: nextAttemptNumber,
        startedAt: now,
        authoritativeDeadline,
        attemptStatus: AttemptStatus.IN_PROGRESS,
        gradingStatus: GradingStatus.PENDING,
      },
    });

    return { attempt: newAttempt, isResumed: false, assessment };
  });

  await recordAuditEvent({
    actorId: user.id,
    action: "ASSESSMENT_ATTEMPT_STARTED",
    targetResourceType: "assessment_attempt",
    targetResourceId: result.attempt.id,
    outcome: "SUCCESS",
    requestId: requestMetadata.requestId,
    ipAddress: requestMetadata.ipAddress,
    userAgent: requestMetadata.userAgent,
    metadata: {
      assessmentId,
      attemptNumber: result.attempt.attemptNumber,
      authoritativeDeadline: result.attempt.authoritativeDeadline.toISOString(),
    },
  });

  return {
    attemptId: result.attempt.id,
    attemptNumber: result.attempt.attemptNumber,
    startedAt: result.attempt.startedAt,
    authoritativeDeadline: result.attempt.authoritativeDeadline,
    durationMinutes: result.assessment.durationMinutes,
    questions: result.assessment.questions.map((q) => ({
      ...q,
      options: JSON.parse(q.options),
    })),
  };
}

export async function saveAttemptAnswer(
  attemptId: string,
  questionId: string,
  submittedAnswers: string[],
  context: AuthenticatedContext
) {
  const { user } = context;

  const attempt = await prisma.assessmentAttempt.findUnique({
    where: { id: attemptId },
  });

  if (!attempt) throw new NotFoundError("Assessment attempt not found");

  if (attempt.studentId !== user.id) {
    throw new ForbiddenError("Cannot submit answers for another student's attempt");
  }

  if (attempt.attemptStatus !== AttemptStatus.IN_PROGRESS) {
    throw new BadRequestError(`Attempt is already ${attempt.attemptStatus.toLowerCase()}`);
  }

  const now = new Date();
  if (now > attempt.authoritativeDeadline) {
    // Auto expire
    await prisma.assessmentAttempt.update({
      where: { id: attempt.id },
      data: { attemptStatus: AttemptStatus.EXPIRED },
    });
    throw new BadRequestError("The assessment timer has expired. Answers can no longer be saved.");
  }

  const answer = await prisma.attemptAnswer.upsert({
    where: {
      attemptId_questionId: {
        attemptId,
        questionId,
      },
    },
    update: {
      submittedAnswers: JSON.stringify(submittedAnswers),
      updatedAt: new Date(),
    },
    create: {
      attemptId,
      questionId,
      submittedAnswers: JSON.stringify(submittedAnswers),
    },
  });

  return answer;
}

export async function submitAssessmentAttempt(
  attemptId: string,
  context: AuthenticatedContext,
  requestMetadata: { requestId: string; ipAddress?: string | null; userAgent?: string | null }
) {
  const { user } = context;

  const result = await prisma.$transaction(async (tx) => {
    const attempt = await tx.assessmentAttempt.findUnique({
      where: { id: attemptId },
      include: {
        assessment: {
          include: {
            questions: true,
          },
        },
        answers: true,
      },
    });

    if (!attempt) throw new NotFoundError("Assessment attempt not found");

    if (attempt.studentId !== user.id) {
      throw new ForbiddenError("Cannot finalize another student's attempt");
    }

    if (attempt.attemptStatus !== AttemptStatus.IN_PROGRESS) {
      throw new ConflictError(`Attempt is already ${attempt.attemptStatus.toLowerCase()}`);
    }

    const now = new Date();
    // Allow up to 30s grace period for clock jitter on submit
    const gracePeriodMs = 30000;
    const isPastDeadline = now.getTime() > attempt.authoritativeDeadline.getTime() + gracePeriodMs;

    const finalStatus = isPastDeadline ? AttemptStatus.EXPIRED : AttemptStatus.SUBMITTED;

    // Server-side deterministic grading for objective questions
    let totalAwardedMarks = 0;
    let allGraded = true;

    for (const question of attempt.assessment.questions) {
      const studentAnswer = attempt.answers.find((a) => a.questionId === question.id);
      const submitted = studentAnswer ? (JSON.parse(studentAnswer.submittedAnswers) as string[]) : [];
      const correct = JSON.parse(question.correctAnswers) as string[];

      let isCorrect = false;
      let awardedMarks = 0;

      if (
        question.questionType === QuestionType.MULTIPLE_CHOICE ||
        question.questionType === QuestionType.TRUE_FALSE
      ) {
        if (submitted.length > 0 && correct.includes(submitted[0])) {
          isCorrect = true;
          awardedMarks = question.marks;
        }
      } else if (question.questionType === QuestionType.MULTIPLE_SELECT) {
        const sortedSubmitted = [...submitted].sort().join(",");
        const sortedCorrect = [...correct].sort().join(",");
        if (sortedSubmitted === sortedCorrect) {
          isCorrect = true;
          awardedMarks = question.marks;
        }
      } else {
        // Short answer or subjective questions require lecturer manual review
        allGraded = false;
      }

      totalAwardedMarks += awardedMarks;

      if (studentAnswer) {
        await tx.attemptAnswer.update({
          where: { id: studentAnswer.id },
          data: {
            awardedMarks,
            isCorrect,
          },
        });
      }
    }

    const finalGradingStatus = allGraded ? GradingStatus.GRADED : GradingStatus.PENDING;

    const updatedAttempt = await tx.assessmentAttempt.update({
      where: { id: attemptId },
      data: {
        attemptStatus: finalStatus,
        submittedAt: now,
        awardedMarks: totalAwardedMarks,
        gradingStatus: finalGradingStatus,
      },
    });

    return {
      attempt: updatedAttempt,
      totalPossibleMarks: attempt.assessment.questions.reduce((sum, q) => sum + q.marks, 0),
    };
  });

  await recordAuditEvent({
    actorId: user.id,
    action: "ASSESSMENT_ATTEMPT_SUBMITTED",
    targetResourceType: "assessment_attempt",
    targetResourceId: attemptId,
    outcome: "SUCCESS",
    requestId: requestMetadata.requestId,
    ipAddress: requestMetadata.ipAddress,
    userAgent: requestMetadata.userAgent,
    metadata: {
      status: result.attempt.attemptStatus,
      gradingStatus: result.attempt.gradingStatus,
      awardedMarks: result.attempt.awardedMarks,
    },
  });

  return {
    attemptId: result.attempt.id,
    attemptStatus: result.attempt.attemptStatus,
    submittedAt: result.attempt.submittedAt,
    gradingStatus: result.attempt.gradingStatus,
    awardedMarks: result.attempt.gradingStatus === GradingStatus.GRADED ? result.attempt.awardedMarks : null,
    totalPossibleMarks: result.totalPossibleMarks,
  };
}
