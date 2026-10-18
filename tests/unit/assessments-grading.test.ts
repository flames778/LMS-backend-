import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/database/prisma";
import {
  createAssessment,
  addAssessmentQuestion,
  publishAssessment,
  getAssessmentForStudent,
  startAssessmentAttempt,
  saveAttemptAnswer,
  submitAssessmentAttempt,
} from "@/modules/assessments/assessments.service";
import {
  gradeSubmission,
  amendGrade,
  releaseGrade,
  getStudentGrades,
} from "@/modules/grading/grading.service";
import { createAssignment, publishAssignment, submitAssignment } from "@/modules/assignments/assignments.service";
import { SystemRoles, SystemPermissions } from "@/modules/roles/roles.constants";
import { AccountStatus, MembershipType, QuestionType, AttemptStatus, GradingStatus } from "@prisma/client";
import { AuthenticatedContext } from "@/modules/auth/guard";

describe("Phase 5: Assessments, Timed Tests, and Grading", () => {
  let lecturerContext: AuthenticatedContext;
  let studentContext: AuthenticatedContext;
  let course: any;
  let assessment: any;
  let q1: any;
  let q2: any;
  let q3: any;

  beforeAll(async () => {
    // Clean up
    await prisma.course.deleteMany({ where: { courseCode: "TEST201" } });
    await prisma.user.deleteMany({
      where: {
        email: { in: ["prof.test@nutm.edu.ng", "student.quiz@nutm.edu.ng"] },
      },
    });

    const lecturer = await prisma.user.create({
      data: {
        email: "prof.test@nutm.edu.ng",
        displayName: "Prof Tester",
        entraTenantId: "nutm-tenant-test",
        entraObjectId: "prof-test-oid",
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
          SystemPermissions.ASSESSMENTS_CREATE,
          SystemPermissions.ASSESSMENTS_PUBLISH,
          SystemPermissions.GRADES_ENTER,
          SystemPermissions.GRADES_RELEASE,
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

    const student = await prisma.user.create({
      data: {
        email: "student.quiz@nutm.edu.ng",
        displayName: "Student Quizz",
        entraTenantId: "nutm-tenant-test",
        entraObjectId: "stud-quiz-oid",
        accountStatus: AccountStatus.APPROVED,
      },
    });

    studentContext = {
      user: {
        id: student.id,
        email: student.email,
        displayName: student.displayName,
        accountStatus: student.accountStatus,
        entraTenantId: student.entraTenantId,
        entraObjectId: student.entraObjectId,
        roles: [SystemRoles.STUDENT],
        permissions: [SystemPermissions.ASSESSMENTS_TAKE, SystemPermissions.GRADES_READ_OWN, SystemPermissions.SUBMISSIONS_CREATE],
      },
      session: {
        userId: student.id,
        email: student.email,
        displayName: student.displayName,
        roles: [SystemRoles.STUDENT],
        accountStatus: "APPROVED",
        entraTenantId: student.entraTenantId,
        entraObjectId: student.entraObjectId,
      },
    };

    course = await prisma.course.create({
      data: {
        courseCode: "TEST201",
        courseTitle: "Software Testing & Verification",
        academicTerm: "2026-Fall",
      },
    });

    await prisma.courseMembership.createMany({
      data: [
        { courseId: course.id, userId: lecturer.id, membershipType: MembershipType.LECTURER },
        { courseId: course.id, userId: student.id, membershipType: MembershipType.STUDENT },
      ],
    });
  });

  it("should create assessment with questions and sanitize answers from students", async () => {
    assessment = await createAssessment(
      course.id,
      {
        title: "Midterm Exam",
        durationMinutes: 45,
        attemptLimit: 1,
        availableFrom: new Date(Date.now() - 3600000),
        availableUntil: new Date(Date.now() + 86400000),
      },
      lecturerContext,
      { requestId: "req-asmt-create" }
    );

    // Q1: Multiple choice
    q1 = await addAssessmentQuestion(
      assessment.id,
      {
        questionText: "What does HTTP status 403 represent?",
        questionType: QuestionType.MULTIPLE_CHOICE,
        options: ["Bad Request", "Unauthorized", "Forbidden", "Not Found"],
        correctAnswers: ["Forbidden"],
        marks: 30,
      },
      lecturerContext,
      { requestId: "req-q1" }
    );

    // Q2: True/False
    q2 = await addAssessmentQuestion(
      assessment.id,
      {
        questionText: "TypeScript enforces types at runtime.",
        questionType: QuestionType.TRUE_FALSE,
        options: ["True", "False"],
        correctAnswers: ["False"],
        marks: 20,
      },
      lecturerContext,
      { requestId: "req-q2" }
    );

    // Q3: Multiple select
    q3 = await addAssessmentQuestion(
      assessment.id,
      {
        questionText: "Which of the following are ACID properties in databases?",
        questionType: QuestionType.MULTIPLE_SELECT,
        options: ["Atomicity", "Consistency", "Isolation", "Durability", "Agility"],
        correctAnswers: ["Atomicity", "Consistency", "Isolation", "Durability"],
        marks: 50,
      },
      lecturerContext,
      { requestId: "req-q3" }
    );

    await publishAssessment(assessment.id, lecturerContext, { requestId: "req-asmt-pub" });

    // Student fetches assessment
    const studentView = await getAssessmentForStudent(assessment.id, studentContext);
    expect(studentView.questions.length).toBe(3);

    // CRITICAL: Ensure correctAnswers are not in student view
    for (const q of studentView.questions) {
      expect((q as any).correctAnswers).toBeUndefined();
    }
  });

  it("should manage attempt lifecycle with server-authoritative timer and deterministic grading", async () => {
    // 1. Start attempt
    const attempt = await startAssessmentAttempt(assessment.id, studentContext, {
      requestId: "req-att-start",
    });

    expect(attempt.attemptNumber).toBe(1);
    expect(attempt.durationMinutes).toBe(45);
    expect(attempt.authoritativeDeadline).toBeDefined();

    // 2. Autosave answers
    // Q1: Correct answer ("Forbidden")
    await saveAttemptAnswer(attempt.attemptId, q1.id, ["Forbidden"], studentContext);
    // Q2: Correct answer ("False")
    await saveAttemptAnswer(attempt.attemptId, q2.id, ["False"], studentContext);
    // Q3: Correct answer (all 4 ACID properties)
    await saveAttemptAnswer(
      attempt.attemptId,
      q3.id,
      ["Atomicity", "Consistency", "Isolation", "Durability"],
      studentContext
    );

    // 3. Finalize attempt
    const submitResult = await submitAssessmentAttempt(attempt.attemptId, studentContext, {
      requestId: "req-att-submit",
    });

    expect(submitResult.attemptStatus).toBe(AttemptStatus.SUBMITTED);
    expect(submitResult.gradingStatus).toBe(GradingStatus.GRADED);
    expect(submitResult.awardedMarks).toBe(100);
    expect(submitResult.totalPossibleMarks).toBe(100);

    // 4. Attempt limit enforcement: 2nd attempt MUST throw ConflictError
    await expect(
      startAssessmentAttempt(assessment.id, studentContext, { requestId: "req-att-start-2" })
    ).rejects.toThrow(/limit/);
  });

  it("should grade assignment, hide unreleased grades, and record grade amendment history", async () => {
    // Create and submit an assignment
    const assignment = await createAssignment(
      course.id,
      {
        title: "Testing Homework",
        instructions: "Write unit tests",
        availableFrom: new Date(Date.now() - 3600000),
        dueDate: new Date(Date.now() + 86400000),
        maximumMarks: 100,
      },
      lecturerContext,
      { requestId: "req-hw-1" }
    );
    await publishAssignment(assignment.id, lecturerContext, { requestId: "req-hw-pub" });

    const submission = await submitAssignment({
      assignmentId: assignment.id,
      fileName: "test_hw.pdf",
      contentType: "application/pdf",
      fileBuffer: Buffer.from("Homework contents", "utf8"),
      context: studentContext,
      requestId: "req-sub-hw",
    });

    // Lecturer grades the submission
    const grade = await gradeSubmission(
      submission.receipt.submissionId,
      {
        awardedMarks: 85,
        maximumMarks: 100,
        feedback: "Great test coverage!",
      },
      lecturerContext,
      { requestId: "req-grade-1" }
    );

    expect(grade.releaseStatus).toBe("UNRELEASED");

    // Student checks grades - UNRELEASED grade must NOT appear!
    const studentGradesBeforeRelease = await getStudentGrades(studentContext);
    expect(studentGradesBeforeRelease.some((g) => g.id === grade.id)).toBe(false);

    // Lecturer amends grade before release
    const amended = await amendGrade(
      grade.id,
      {
        newMarks: 90,
        newFeedback: "Bonus marks for clean architecture",
        changeReason: "Reviewed extra credit section",
      },
      lecturerContext,
      { requestId: "req-amend-1" }
    );

    expect(amended.awardedMarks).toBe(90);

    // Verify GradeAudit record exists
    const auditRecord = await prisma.gradeAudit.findFirst({
      where: { gradeId: grade.id },
    });
    expect(auditRecord).toBeDefined();
    expect(auditRecord?.previousMarks).toBe(85);
    expect(auditRecord?.newMarks).toBe(90);
    expect(auditRecord?.changeReason).toBe("Reviewed extra credit section");

    // Lecturer releases grade
    const released = await releaseGrade(grade.id, lecturerContext, { requestId: "req-rel-1" });
    expect(released.releaseStatus).toBe("RELEASED");

    // Student now sees released grade
    const studentGradesAfter = await getStudentGrades(studentContext);
    const visibleGrade = studentGradesAfter.find((g) => g.id === grade.id);
    expect(visibleGrade).toBeDefined();
    expect(visibleGrade?.awardedMarks).toBe(90);
    expect(visibleGrade?.feedback).toBe("Bonus marks for clean architecture");
  });
});
