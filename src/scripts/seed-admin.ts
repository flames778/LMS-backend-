import { prisma } from "../lib/database/prisma";
import { SystemRoles, SystemPermissions, DEFAULT_ROLE_PERMISSIONS, SystemRole } from "../modules/roles/roles.constants";
import { AccountStatus } from "@prisma/client";
import { logger } from "../lib/logging/logger";

export async function seedDatabase(initialAdminEmail = "it.admin@nutm.edu.ng", initialAdminTenantId = "nutm-tenant-uuid-00000000-0000") {
  logger.info("Starting system seed for roles, permissions, and administrator...");

  // 1. Seed Permissions
  for (const permKey of Object.keys(SystemPermissions)) {
    const permName = SystemPermissions[permKey as keyof typeof SystemPermissions];
    await prisma.permission.upsert({
      where: { name: permName },
      update: {},
      create: {
        name: permName,
        description: `Permission for ${permName}`,
      },
    });
  }

  // 2. Seed Roles and map permissions
  for (const roleKey of Object.keys(SystemRoles)) {
    const roleName = SystemRoles[roleKey as keyof typeof SystemRoles] as SystemRole;
    const role = await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: {
        name: roleName,
        description: `System role for ${roleName}`,
      },
    });

    const allowedPermissions = DEFAULT_ROLE_PERMISSIONS[roleName] || [];
    for (const permName of allowedPermissions) {
      const permission = await prisma.permission.findUnique({ where: { name: permName } });
      if (permission) {
        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId: permission.id,
            },
          },
          update: {},
          create: {
            roleId: role.id,
            permissionId: permission.id,
          },
        });
      }
    }
  }

  // 3. Create or promote initial IT Administrator
  const itAdminRole = await prisma.role.findUniqueOrThrow({ where: { name: SystemRoles.IT_ADMIN } });
  const adminObjectId = `admin-oid-${Buffer.from(initialAdminEmail).toString("hex").slice(0, 16)}`;
  const adminUser = await prisma.user.upsert({
    where: { email: initialAdminEmail.toLowerCase().trim() },
    update: {
      accountStatus: AccountStatus.APPROVED,
    },
    create: {
      email: initialAdminEmail.toLowerCase().trim(),
      displayName: "NUTM IT Administrator",
      entraTenantId: initialAdminTenantId,
      entraObjectId: adminObjectId,
      accountStatus: AccountStatus.APPROVED,
    },
  });

  // Assign IT_ADMIN role
  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: adminUser.id,
        roleId: itAdminRole.id,
      },
    },
    update: {},
    create: {
      userId: adminUser.id,
      roleId: itAdminRole.id,
      assignedById: null, // Initial bootstrap
    },
  });

  logger.info("System seed completed successfully.", {
    adminEmail: adminUser.email,
    adminId: adminUser.id,
    rolesCount: Object.keys(SystemRoles).length,
  });

  return adminUser;
}

if (require.main === module) {
  seedDatabase()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error("Seed error:", err);
      process.exit(1);
    });
}
