import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/database/prisma";
import { verifySessionToken, SESSION_COOKIE_NAME, SessionPayload } from "@/lib/security/session";
import { UnauthorizedError, ForbiddenError } from "@/lib/errors/api-error";
import { AccountStatus } from "@prisma/client";

export interface AuthenticatedContext {
  user: {
    id: string;
    email: string;
    displayName: string;
    accountStatus: AccountStatus;
    entraTenantId: string;
    entraObjectId: string;
    roles: string[];
    permissions: string[];
  };
  session: SessionPayload;
}

export async function authenticateRequest(req?: Request): Promise<AuthenticatedContext> {
  let token: string | undefined;

  // 1. Try extracting from Authorization header
  if (req) {
    const authHeader = req.headers.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7).trim();
    }
  } else {
    try {
      const headerList = await headers();
      const authHeader = headerList.get("authorization");
      if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.substring(7).trim();
      }
    } catch {
      // Header context not available
    }
  }

  // 2. Fall back to secure session cookie
  if (!token) {
    try {
      const cookieStore = await cookies();
      const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);
      token = sessionCookie?.value;
    } catch {
      // Cookie context not available
    }
  }

  if (!token) {
    throw new UnauthorizedError("Authentication required. Please sign in with your NUTM Microsoft account.");
  }

  // Verify JWT signature and expiration
  const sessionPayload = await verifySessionToken(token);

  // Re-verify against current database record to immediately reflect suspensions or revocations
  const user = await prisma.user.findUnique({
    where: { id: sessionPayload.userId },
    include: {
      userRoles: {
        include: {
          role: {
            include: {
              rolePermissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!user) {
    throw new UnauthorizedError("User profile no longer exists.");
  }

  if (user.accountStatus === AccountStatus.SUSPENDED) {
    throw new ForbiddenError("Your account has been suspended by IT Administration.");
  }

  if (user.accountStatus === AccountStatus.REJECTED) {
    throw new ForbiddenError("Your access request was rejected.");
  }

  const roleNames = user.userRoles.map((ur) => ur.role.name);
  const permissionNames = Array.from(
    new Set(
      user.userRoles.flatMap((ur) =>
        ur.role.rolePermissions.map((rp) => rp.permission.name)
      )
    )
  );

  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      accountStatus: user.accountStatus,
      entraTenantId: user.entraTenantId,
      entraObjectId: user.entraObjectId,
      roles: roleNames,
      permissions: permissionNames,
    },
    session: sessionPayload,
  };
}

export async function requireApproved(req?: Request): Promise<AuthenticatedContext> {
  const context = await authenticateRequest(req);
  if (context.user.accountStatus !== AccountStatus.APPROVED) {
    throw new ForbiddenError("Your account is pending review and approval by an authorized IT administrator.");
  }
  return context;
}

export async function requireRole(
  req: Request | undefined,
  ...allowedRoles: string[]
): Promise<AuthenticatedContext> {
  const context = await requireApproved(req);
  const hasRole = context.user.roles.some((r) => allowedRoles.includes(r));
  if (!hasRole) {
    throw new ForbiddenError(
      `Access denied. Requires one of the following roles: ${allowedRoles.join(", ")}`
    );
  }
  return context;
}

export async function requirePermission(
  req: Request | undefined,
  ...requiredPermissions: string[]
): Promise<AuthenticatedContext> {
  const context = await requireApproved(req);
  const hasAllPermissions = requiredPermissions.every((perm) =>
    context.user.permissions.includes(perm)
  );
  if (!hasAllPermissions) {
    throw new ForbiddenError(
      `Access denied. Missing required permission(s): ${requiredPermissions.join(", ")}`
    );
  }
  return context;
}
