import { prisma } from "@/lib/database/prisma";
import { AccountStatus, AccessRequestStatus } from "@prisma/client";
import { NotFoundError, ConflictError, BadRequestError } from "@/lib/errors/api-error";
import { recordAuditEvent } from "@/modules/audit/audit.service";
import { SystemRole } from "@/modules/roles/roles.constants";

export async function listAccessRequests(params: {
  status?: AccessRequestStatus;
  limit?: number;
  offset?: number;
}) {
  const limit = Math.min(params.limit || 50, 100);
  const offset = params.offset || 0;
  const where: Record<string, unknown> = {};
  if (params.status) where.status = params.status;

  const [items, total] = await Promise.all([
    prisma.accessRequest.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: { submissionTimestamp: "desc" },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
            accountStatus: true,
            createdAt: true,
          },
        },
        reviewer: {
          select: {
            id: true,
            email: true,
            displayName: true,
          },
        },
      },
    }),
    prisma.accessRequest.count({ where }),
  ]);

  return { items, pagination: { total, limit, offset } };
}

export async function getAccessRequestById(id: string) {
  const request = await prisma.accessRequest.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          displayName: true,
          accountStatus: true,
          createdAt: true,
        },
      },
      reviewer: {
        select: {
          id: true,
          email: true,
          displayName: true,
        },
      },
    },
  });

  if (!request) {
    throw new NotFoundError("Access request not found");
  }
  return request;
}

export async function approveAccessRequest(params: {
  requestId: string;
  reviewerId: string;
  roleName?: SystemRole;
  decisionReason?: string;
  requestIdHeader: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const result = await prisma.$transaction(async (tx) => {
    // 1. Lock and check request state
    const accessRequest = await tx.accessRequest.findUnique({
      where: { id: params.requestId },
      include: { user: true },
    });

    if (!accessRequest) {
      throw new NotFoundError("Access request not found");
    }

    if (accessRequest.status !== AccessRequestStatus.PENDING) {
      throw new ConflictError(`Access request has already been ${accessRequest.status.toLowerCase()}`);
    }

    if (accessRequest.userId === params.reviewerId) {
      throw new BadRequestError("Administrators cannot approve their own access requests (separation of duties).");
    }

    // 2. Update access request
    const updatedRequest = await tx.accessRequest.update({
      where: { id: params.requestId },
      data: {
        status: AccessRequestStatus.APPROVED,
        reviewerId: params.reviewerId,
        reviewTimestamp: new Date(),
        decisionReason: params.decisionReason || "Approved by IT Administrator",
      },
    });

    // 3. Update user status to APPROVED
    await tx.user.update({
      where: { id: accessRequest.userId },
      data: { accountStatus: AccountStatus.APPROVED },
    });

    // 4. Optionally assign initial role
    if (params.roleName) {
      const role = await tx.role.findUnique({ where: { name: params.roleName } });
      if (role) {
        await tx.userRole.upsert({
          where: {
            userId_roleId: {
              userId: accessRequest.userId,
              roleId: role.id,
            },
          },
          update: {},
          create: {
            userId: accessRequest.userId,
            roleId: role.id,
            assignedById: params.reviewerId,
          },
        });
      }
    }

    return updatedRequest;
  });

  await recordAuditEvent({
    actorId: params.reviewerId,
    action: "ACCESS_REQUEST_APPROVED",
    targetResourceType: "access_request",
    targetResourceId: params.requestId,
    outcome: "SUCCESS",
    requestId: params.requestIdHeader,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    metadata: {
      roleAssigned: params.roleName || null,
      reason: params.decisionReason,
    },
  });

  return result;
}

export async function rejectAccessRequest(params: {
  requestId: string;
  reviewerId: string;
  decisionReason: string;
  requestIdHeader: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const result = await prisma.$transaction(async (tx) => {
    const accessRequest = await tx.accessRequest.findUnique({
      where: { id: params.requestId },
    });

    if (!accessRequest) {
      throw new NotFoundError("Access request not found");
    }

    if (accessRequest.status !== AccessRequestStatus.PENDING) {
      throw new ConflictError(`Access request has already been ${accessRequest.status.toLowerCase()}`);
    }

    const updatedRequest = await tx.accessRequest.update({
      where: { id: params.requestId },
      data: {
        status: AccessRequestStatus.REJECTED,
        reviewerId: params.reviewerId,
        reviewTimestamp: new Date(),
        decisionReason: params.decisionReason,
      },
    });

    await tx.user.update({
      where: { id: accessRequest.userId },
      data: { accountStatus: AccountStatus.REJECTED },
    });

    return updatedRequest;
  });

  await recordAuditEvent({
    actorId: params.reviewerId,
    action: "ACCESS_REQUEST_REJECTED",
    targetResourceType: "access_request",
    targetResourceId: params.requestId,
    outcome: "SUCCESS",
    requestId: params.requestIdHeader,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    metadata: { reason: params.decisionReason },
  });

  return result;
}

export async function suspendUser(params: {
  targetUserId: string;
  actorId: string;
  reason: string;
  requestIdHeader: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  if (params.targetUserId === params.actorId) {
    throw new BadRequestError("Administrators cannot suspend their own account.");
  }

  const user = await prisma.user.findUnique({ where: { id: params.targetUserId } });
  if (!user) throw new NotFoundError("Target user not found");

  const updatedUser = await prisma.user.update({
    where: { id: params.targetUserId },
    data: { accountStatus: AccountStatus.SUSPENDED },
  });

  await recordAuditEvent({
    actorId: params.actorId,
    action: "USER_SUSPENDED",
    targetResourceType: "user",
    targetResourceId: params.targetUserId,
    outcome: "SUCCESS",
    requestId: params.requestIdHeader,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    metadata: { reason: params.reason },
  });

  return updatedUser;
}

export async function reactivateUser(params: {
  targetUserId: string;
  actorId: string;
  requestIdHeader: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const user = await prisma.user.findUnique({ where: { id: params.targetUserId } });
  if (!user) throw new NotFoundError("Target user not found");

  const updatedUser = await prisma.user.update({
    where: { id: params.targetUserId },
    data: { accountStatus: AccountStatus.APPROVED },
  });

  await recordAuditEvent({
    actorId: params.actorId,
    action: "USER_REACTIVATED",
    targetResourceType: "user",
    targetResourceId: params.targetUserId,
    outcome: "SUCCESS",
    requestId: params.requestIdHeader,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });

  return updatedUser;
}

export async function assignUserRole(params: {
  targetUserId: string;
  roleName: string;
  actorId: string;
  requestIdHeader: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const [targetUser, role] = await Promise.all([
    prisma.user.findUnique({ where: { id: params.targetUserId } }),
    prisma.role.findUnique({ where: { name: params.roleName } }),
  ]);

  if (!targetUser) throw new NotFoundError("Target user not found");
  if (!role) throw new NotFoundError(`Role '${params.roleName}' not found`);

  const userRole = await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: params.targetUserId,
        roleId: role.id,
      },
    },
    update: {
      assignedById: params.actorId,
      assignedAt: new Date(),
    },
    create: {
      userId: params.targetUserId,
      roleId: role.id,
      assignedById: params.actorId,
    },
  });

  await recordAuditEvent({
    actorId: params.actorId,
    action: "USER_ROLE_ASSIGNED",
    targetResourceType: "user_role",
    targetResourceId: userRole.id,
    outcome: "SUCCESS",
    requestId: params.requestIdHeader,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    metadata: {
      targetUserId: params.targetUserId,
      roleName: params.roleName,
    },
  });

  return userRole;
}

export async function revokeUserRole(params: {
  targetUserId: string;
  roleName: string;
  actorId: string;
  requestIdHeader: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const role = await prisma.role.findUnique({ where: { name: params.roleName } });
  if (!role) throw new NotFoundError(`Role '${params.roleName}' not found`);

  const deleted = await prisma.userRole.deleteMany({
    where: {
      userId: params.targetUserId,
      roleId: role.id,
    },
  });

  if (deleted.count === 0) {
    throw new NotFoundError("User does not have this role assigned");
  }

  await recordAuditEvent({
    actorId: params.actorId,
    action: "USER_ROLE_REVOKED",
    targetResourceType: "user_role",
    targetResourceId: `${params.targetUserId}:${role.id}`,
    outcome: "SUCCESS",
    requestId: params.requestIdHeader,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    metadata: {
      targetUserId: params.targetUserId,
      roleName: params.roleName,
    },
  });

  return { success: true };
}
