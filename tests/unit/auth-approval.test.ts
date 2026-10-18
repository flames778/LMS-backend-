import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/database/prisma";
import { createSessionToken } from "@/lib/security/session";
import { authenticateRequest, requireApproved, requireRole } from "@/modules/auth/guard";
import {
  approveAccessRequest,
  rejectAccessRequest,
  suspendUser,
  reactivateUser,
  assignUserRole,
} from "@/modules/approvals/approvals.service";
import { seedDatabase } from "@/scripts/seed-admin";
import { SystemRoles } from "@/modules/roles/roles.constants";
import { AccountStatus, AccessRequestStatus } from "@prisma/client";

describe("Phase 2: Authentication, IT Approvals, and RBAC Security", () => {
  let adminUserId: string;

  beforeAll(async () => {
    // Clean up test emails from previous runs
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            "alice.student@nutm.edu.ng",
            "bob.student@nutm.edu.ng",
            "it.admin.test@nutm.edu.ng",
          ],
        },
      },
    });

    const admin = await seedDatabase("it.admin.test@nutm.edu.ng", "nutm-tenant-test");
    adminUserId = admin.id;
  });

  it("should enforce PENDING status for new user access requests", async () => {
    const newStudent = await prisma.user.create({
      data: {
        email: "alice.student@nutm.edu.ng",
        displayName: "Alice Student",
        entraTenantId: "nutm-tenant-test",
        entraObjectId: "alice-oid-1234",
        accountStatus: AccountStatus.PENDING,
      },
    });

    const accessReq = await prisma.accessRequest.create({
      data: {
        userId: newStudent.id,
        status: AccessRequestStatus.PENDING,
      },
    });

    expect(newStudent.accountStatus).toBe(AccountStatus.PENDING);
    expect(accessReq.status).toBe(AccessRequestStatus.PENDING);

    // Verify session token generation for pending user
    const pendingToken = await createSessionToken({
      userId: newStudent.id,
      email: newStudent.email,
      displayName: newStudent.displayName,
      roles: [],
      accountStatus: newStudent.accountStatus,
      entraTenantId: newStudent.entraTenantId,
      entraObjectId: newStudent.entraObjectId,
    });

    const mockReq = new Request("http://localhost:3000/api/v1/courses", {
      headers: { authorization: `Bearer ${pendingToken}` },
    });

    // Guard MUST reject pending users with 403 Forbidden
    await expect(requireApproved(mockReq)).rejects.toThrow(/pending review/);
  });

  it("should allow authorized IT admin to approve access request and assign STUDENT role", async () => {
    const studentUser = await prisma.user.findUniqueOrThrow({
      where: { email: "alice.student@nutm.edu.ng" },
    });
    const accessReq = await prisma.accessRequest.findFirstOrThrow({
      where: { userId: studentUser.id, status: AccessRequestStatus.PENDING },
    });

    const approvalResult = await approveAccessRequest({
      requestId: accessReq.id,
      reviewerId: adminUserId,
      roleName: SystemRoles.STUDENT,
      decisionReason: "Enrolment roster verified",
      requestIdHeader: "req-test-1",
    });

    expect(approvalResult.status).toBe(AccessRequestStatus.APPROVED);

    const updatedUser = await prisma.user.findUniqueOrThrow({
      where: { id: studentUser.id },
      include: { userRoles: { include: { role: true } } },
    });

    expect(updatedUser.accountStatus).toBe(AccountStatus.APPROVED);
    expect(updatedUser.userRoles.some((ur) => ur.role.name === SystemRoles.STUDENT)).toBe(true);

    // Verify approved user passes requireApproved guard
    const approvedToken = await createSessionToken({
      userId: updatedUser.id,
      email: updatedUser.email,
      displayName: updatedUser.displayName,
      roles: [SystemRoles.STUDENT],
      accountStatus: updatedUser.accountStatus,
      entraTenantId: updatedUser.entraTenantId,
      entraObjectId: updatedUser.entraObjectId,
    });

    const mockReq = new Request("http://localhost:3000/api/v1/courses", {
      headers: { authorization: `Bearer ${approvedToken}` },
    });

    const context = await requireApproved(mockReq);
    expect(context.user.accountStatus).toBe(AccountStatus.APPROVED);

    // Student should pass student role check but fail IT_ADMIN check
    await expect(requireRole(mockReq, SystemRoles.STUDENT)).resolves.toBeDefined();
    await expect(requireRole(mockReq, SystemRoles.IT_ADMIN)).rejects.toThrow(/Access denied/);
  });

  it("should enforce separation of duties: admin cannot approve their own access request", async () => {
    const adminSelfReq = await prisma.accessRequest.create({
      data: {
        userId: adminUserId,
        status: AccessRequestStatus.PENDING,
      },
    });

    await expect(
      approveAccessRequest({
        requestId: adminSelfReq.id,
        reviewerId: adminUserId,
        requestIdHeader: "req-self-approve",
      })
    ).rejects.toThrow(/separation of duties/);

    await prisma.accessRequest.delete({ where: { id: adminSelfReq.id } });
  });

  it("should prevent duplicate / conflicting approvals", async () => {
    const user2 = await prisma.user.create({
      data: {
        email: "bob.student@nutm.edu.ng",
        displayName: "Bob Student",
        entraTenantId: "nutm-tenant-test",
        entraObjectId: "bob-oid-5678",
        accountStatus: AccountStatus.PENDING,
      },
    });

    const req2 = await prisma.accessRequest.create({
      data: { userId: user2.id, status: AccessRequestStatus.PENDING },
    });

    await approveAccessRequest({
      requestId: req2.id,
      reviewerId: adminUserId,
      requestIdHeader: "req-dup-1",
    });

    // Second approval attempt MUST throw ConflictError
    await expect(
      approveAccessRequest({
        requestId: req2.id,
        reviewerId: adminUserId,
        requestIdHeader: "req-dup-2",
      })
    ).rejects.toThrow(/already been approved/);
  });

  it("should immediately deny access when a user is suspended", async () => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: "alice.student@nutm.edu.ng" },
    });

    // Suspend user
    await suspendUser({
      targetUserId: user.id,
      actorId: adminUserId,
      reason: "Security audit hold",
      requestIdHeader: "req-suspend-1",
    });

    // Attempt access with existing valid token
    const token = await createSessionToken({
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      roles: [SystemRoles.STUDENT],
      accountStatus: AccountStatus.APPROVED, // Even if token claims APPROVED...
      entraTenantId: user.entraTenantId,
      entraObjectId: user.entraObjectId,
    });

    const mockReq = new Request("http://localhost:3000/api/v1/courses", {
      headers: { authorization: `Bearer ${token}` },
    });

    // Must be rejected because live database check detects SUSPENDED status
    await expect(authenticateRequest(mockReq)).rejects.toThrow(/suspended/);

    // Reactivate user
    await reactivateUser({
      targetUserId: user.id,
      actorId: adminUserId,
      requestIdHeader: "req-reactivate-1",
    });

    // Now should succeed again
    await expect(authenticateRequest(mockReq)).resolves.toBeDefined();
  });

  it("should record immutable audit logs for administrative actions", async () => {
    const auditLogs = await prisma.auditLog.findMany({
      where: { actorId: adminUserId },
      orderBy: { timestamp: "desc" },
    });

    expect(auditLogs.length).toBeGreaterThan(0);
    const actions = auditLogs.map((a) => a.action);
    expect(actions).toContain("ACCESS_REQUEST_APPROVED");
    expect(actions).toContain("USER_SUSPENDED");
    expect(actions).toContain("USER_REACTIVATED");
  });
});
