import { prisma } from "@/lib/database/prisma";
import { AuditOutcome } from "@prisma/client";
import { logger } from "@/lib/logging/logger";

export interface LogAuditParams {
  actorId?: string | null;
  action: string;
  targetResourceType: string;
  targetResourceId: string;
  outcome: "SUCCESS" | "FAILURE" | "DENIED";
  requestId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function recordAuditEvent(params: LogAuditParams): Promise<void> {
  try {
    let outcomeEnum: AuditOutcome;
    if (params.outcome === "SUCCESS") outcomeEnum = AuditOutcome.SUCCESS;
    else if (params.outcome === "FAILURE") outcomeEnum = AuditOutcome.FAILURE;
    else outcomeEnum = AuditOutcome.DENIED;

    await prisma.auditLog.create({
      data: {
        actorId: params.actorId || null,
        action: params.action,
        targetResourceType: params.targetResourceType,
        targetResourceId: params.targetResourceId,
        outcome: outcomeEnum,
        requestId: params.requestId,
        ipAddress: params.ipAddress || null,
        userAgent: params.userAgent || null,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      },
    });
  } catch (error) {
    logger.error("Failed to write audit log to database", {
      action: params.action,
      error: String(error),
    });
  }
}

export interface QueryAuditLogsParams {
  actorId?: string;
  targetResourceType?: string;
  action?: string;
  limit?: number;
  offset?: number;
}

export async function queryAuditLogs(params: QueryAuditLogsParams) {
  const limit = Math.min(params.limit || 50, 100);
  const offset = params.offset || 0;

  const where: Record<string, unknown> = {};
  if (params.actorId) where.actorId = params.actorId;
  if (params.targetResourceType) where.targetResourceType = params.targetResourceType;
  if (params.action) where.action = params.action;

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: "desc" },
      take: limit,
      skip: offset,
      include: {
        actor: {
          select: {
            id: true,
            email: true,
            displayName: true,
          },
        },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    items,
    pagination: {
      total,
      limit,
      offset,
    },
  };
}
