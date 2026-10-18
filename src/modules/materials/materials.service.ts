import { prisma } from "@/lib/database/prisma";
import { PublicationStatus, MembershipType } from "@prisma/client";
import { NotFoundError, ForbiddenError, BadRequestError } from "@/lib/errors/api-error";
import { getStorageProvider } from "@/lib/storage/storage-provider";
import { recordAuditEvent } from "@/modules/audit/audit.service";
import { AuthenticatedContext } from "@/modules/auth/guard";
import { SystemRoles, SystemPermissions } from "@/modules/roles/roles.constants";

export async function listCourseMaterials(courseId: string, context: AuthenticatedContext) {
  const { user } = context;
  const isGlobalAdmin =
    user.roles.includes(SystemRoles.IT_ADMIN) ||
    user.roles.includes(SystemRoles.ACADEMIC_ADMIN);

  // Check enrollment
  const membership = await prisma.courseMembership.findUnique({
    where: { courseId_userId: { courseId, userId: user.id } },
  });

  if (!isGlobalAdmin && (!membership || membership.status !== "ACTIVE")) {
    throw new ForbiddenError("You are not enrolled in this course");
  }

  const isLecturerOrAdmin =
    isGlobalAdmin || (membership && membership.membershipType === MembershipType.LECTURER);

  const where: Record<string, unknown> = { courseId };
  // Students ONLY see published materials
  if (!isLecturerOrAdmin) {
    where.publicationStatus = PublicationStatus.PUBLISHED;
  }

  return await prisma.material.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      uploader: {
        select: {
          id: true,
          displayName: true,
          email: true,
        },
      },
    },
  });
}

export async function uploadMaterial(params: {
  courseId: string;
  title: string;
  description?: string;
  fileName: string;
  contentType: string;
  fileBuffer: Buffer;
  context: AuthenticatedContext;
  requestId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const { user } = params.context;
  const isGlobalAdmin =
    user.roles.includes(SystemRoles.IT_ADMIN) ||
    user.roles.includes(SystemRoles.ACADEMIC_ADMIN);

  const membership = await prisma.courseMembership.findUnique({
    where: { courseId_userId: { courseId: params.courseId, userId: user.id } },
  });

  if (!isGlobalAdmin && (!membership || membership.membershipType !== MembershipType.LECTURER)) {
    throw new ForbiddenError("Only assigned lecturers or administrators can upload course materials");
  }

  // Enforce size limit (50MB)
  const maxSizeBytes = 52428800;
  if (params.fileBuffer.length > maxSizeBytes) {
    throw new BadRequestError("File size exceeds 50MB limit");
  }

  const storage = getStorageProvider();
  const saveResult = await storage.saveFile(params.fileName, params.fileBuffer, params.contentType);

  const material = await prisma.material.create({
    data: {
      courseId: params.courseId,
      uploaderId: user.id,
      title: params.title.trim(),
      description: params.description,
      storageProvider: saveResult.storageProvider,
      storageObjectRef: saveResult.storageRef,
      fileName: params.fileName,
      contentType: params.contentType,
      fileSizeBytes: saveResult.fileSizeBytes,
      publicationStatus: PublicationStatus.DRAFT, // default draft
    },
  });

  await recordAuditEvent({
    actorId: user.id,
    action: "MATERIAL_UPLOADED",
    targetResourceType: "material",
    targetResourceId: material.id,
    outcome: "SUCCESS",
    requestId: params.requestId,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    metadata: {
      courseId: params.courseId,
      fileName: params.fileName,
      sizeBytes: Number(saveResult.fileSizeBytes),
    },
  });

  return material;
}

export async function publishMaterial(
  materialId: string,
  context: AuthenticatedContext,
  requestMetadata: { requestId: string; ipAddress?: string | null; userAgent?: string | null }
) {
  const material = await prisma.material.findUnique({ where: { id: materialId } });
  if (!material) throw new NotFoundError("Material not found");

  const { user } = context;
  const isGlobalAdmin =
    user.roles.includes(SystemRoles.IT_ADMIN) ||
    user.roles.includes(SystemRoles.ACADEMIC_ADMIN);

  const membership = await prisma.courseMembership.findUnique({
    where: { courseId_userId: { courseId: material.courseId, userId: user.id } },
  });

  if (!isGlobalAdmin && (!membership || membership.membershipType !== MembershipType.LECTURER)) {
    throw new ForbiddenError("Only assigned course lecturers or administrators can publish materials");
  }

  const updated = await prisma.material.update({
    where: { id: materialId },
    data: {
      publicationStatus: PublicationStatus.PUBLISHED,
      publishedAt: new Date(),
    },
  });

  await recordAuditEvent({
    actorId: user.id,
    action: "MATERIAL_PUBLISHED",
    targetResourceType: "material",
    targetResourceId: materialId,
    outcome: "SUCCESS",
    requestId: requestMetadata.requestId,
    ipAddress: requestMetadata.ipAddress,
    userAgent: requestMetadata.userAgent,
    metadata: { courseId: material.courseId },
  });

  return updated;
}

export async function getMaterialFile(materialId: string, context: AuthenticatedContext) {
  const material = await prisma.material.findUnique({ where: { id: materialId } });
  if (!material) throw new NotFoundError("Material not found");

  const { user } = context;
  const isGlobalAdmin =
    user.roles.includes(SystemRoles.IT_ADMIN) ||
    user.roles.includes(SystemRoles.ACADEMIC_ADMIN);

  const membership = await prisma.courseMembership.findUnique({
    where: { courseId_userId: { courseId: material.courseId, userId: user.id } },
  });

  if (!isGlobalAdmin && (!membership || membership.status !== "ACTIVE")) {
    throw new ForbiddenError("You are not enrolled in this course");
  }

  // Draft materials inaccessible to students
  if (
    !isGlobalAdmin &&
    membership?.membershipType === MembershipType.STUDENT &&
    material.publicationStatus !== PublicationStatus.PUBLISHED
  ) {
    throw new NotFoundError("Material not found or not yet published");
  }

  const storage = getStorageProvider();
  const buffer = await storage.getFileBuffer(material.storageObjectRef);

  return {
    buffer,
    fileName: material.fileName,
    contentType: material.contentType,
  };
}

export async function deleteMaterial(
  materialId: string,
  context: AuthenticatedContext,
  requestMetadata: { requestId: string; ipAddress?: string | null; userAgent?: string | null }
) {
  const material = await prisma.material.findUnique({ where: { id: materialId } });
  if (!material) throw new NotFoundError("Material not found");

  const { user } = context;
  const isGlobalAdmin =
    user.roles.includes(SystemRoles.IT_ADMIN) ||
    user.roles.includes(SystemRoles.ACADEMIC_ADMIN);

  const membership = await prisma.courseMembership.findUnique({
    where: { courseId_userId: { courseId: material.courseId, userId: user.id } },
  });

  if (!isGlobalAdmin && (!membership || membership.membershipType !== MembershipType.LECTURER)) {
    throw new ForbiddenError("Only assigned course lecturers or administrators can delete materials");
  }

  const storage = getStorageProvider();
  await storage.deleteFile(material.storageObjectRef);
  await prisma.material.delete({ where: { id: materialId } });

  await recordAuditEvent({
    actorId: user.id,
    action: "MATERIAL_DELETED",
    targetResourceType: "material",
    targetResourceId: materialId,
    outcome: "SUCCESS",
    requestId: requestMetadata.requestId,
    ipAddress: requestMetadata.ipAddress,
    userAgent: requestMetadata.userAgent,
    metadata: { courseId: material.courseId },
  });

  return { success: true };
}
