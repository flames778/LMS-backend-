import { prisma } from "@/lib/database/prisma";
import { validateAuthCode } from "@/lib/microsoft/entra";
import { createSessionToken } from "@/lib/security/session";
import { AccountStatus, AccessRequestStatus } from "@prisma/client";
import { recordAuditEvent } from "@/modules/audit/audit.service";
import { BadRequestError, ForbiddenError } from "@/lib/errors/api-error";
import { timingSafeEqualString } from "@/lib/security/auth-crypto";

export interface EntraCallbackParams {
  code: string;
  state: string;
  storedState?: string;
  storedNonce?: string;
  requestId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function processEntraCallback(params: EntraCallbackParams) {
  // 1. Verify state parameter against CSRF / replay attacks
  if (!params.storedState || !timingSafeEqualString(params.state, params.storedState)) {
    throw new BadRequestError("Invalid or expired authentication state parameter. Please retry sign in.");
  }

  // 2. Exchange code with Microsoft Entra ID
  const entraIdentity = await validateAuthCode(params.code, params.storedNonce || "");

  // 3. Resolve or create LMS user record
  let user = await prisma.user.findUnique({
    where: {
      entra_identity_unique: {
        entraTenantId: entraIdentity.tenantId,
        entraObjectId: entraIdentity.objectId,
      },
    },
    include: {
      userRoles: {
        include: {
          role: true,
        },
      },
    },
  });

  let isNewUser = false;

  if (!user) {
    // New user onboarding - IT approval policy requires PENDING status
    isNewUser = true;
    user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          entraTenantId: entraIdentity.tenantId,
          entraObjectId: entraIdentity.objectId,
          email: entraIdentity.email,
          displayName: entraIdentity.displayName,
          accountStatus: AccountStatus.PENDING,
          lastLoginAt: new Date(),
        },
        include: {
          userRoles: {
            include: {
              role: true,
            },
          },
        },
      });

      // Record access request for IT administrator review
      await tx.accessRequest.create({
        data: {
          userId: newUser.id,
          status: AccessRequestStatus.PENDING,
        },
      });

      return newUser;
    });

    await recordAuditEvent({
      actorId: user.id,
      action: "USER_ACCESS_REQUEST_SUBMITTED",
      targetResourceType: "user",
      targetResourceId: user.id,
      outcome: "SUCCESS",
      requestId: params.requestId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      metadata: {
        email: user.email,
        entraObjectId: entraIdentity.objectId,
      },
    });
  } else {
    // Existing user login
    if (user.accountStatus === AccountStatus.SUSPENDED) {
      await recordAuditEvent({
        actorId: user.id,
        action: "LOGIN_REJECTED_SUSPENDED",
        targetResourceType: "user",
        targetResourceId: user.id,
        outcome: "DENIED",
        requestId: params.requestId,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      });
      throw new ForbiddenError("Your account has been suspended by IT Administration.");
    }

    if (user.accountStatus === AccountStatus.REJECTED) {
      await recordAuditEvent({
        actorId: user.id,
        action: "LOGIN_REJECTED_UNAPPROVED",
        targetResourceType: "user",
        targetResourceId: user.id,
        outcome: "DENIED",
        requestId: params.requestId,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      });
      throw new ForbiddenError("Your access request was rejected.");
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await recordAuditEvent({
      actorId: user.id,
      action: "LOGIN_SUCCESS",
      targetResourceType: "user",
      targetResourceId: user.id,
      outcome: "SUCCESS",
      requestId: params.requestId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    });
  }

  const assignedRoles = user.userRoles.map((ur) => ur.role.name);

  // Issue server-side session token
  const token = await createSessionToken({
    userId: user.id,
    email: user.email,
    displayName: user.displayName,
    roles: assignedRoles,
    accountStatus: user.accountStatus,
    entraTenantId: user.entraTenantId,
    entraObjectId: user.entraObjectId,
  });

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      accountStatus: user.accountStatus,
      roles: assignedRoles,
      isNewUser,
    },
  };
}
