export const SystemRoles = {
  STUDENT: "STUDENT",
  LECTURER: "LECTURER",
  IT_ADMIN: "IT_ADMIN",
  ACADEMIC_ADMIN: "ACADEMIC_ADMIN",
} as const;

export type SystemRole = (typeof SystemRoles)[keyof typeof SystemRoles];

export const SystemPermissions = {
  USERS_READ: "users.read",
  USERS_APPROVE: "users.approve",
  USERS_SUSPEND: "users.suspend",
  ROLES_ASSIGN: "roles.assign",
  
  COURSES_READ: "courses.read",
  COURSES_CREATE: "courses.create",
  COURSES_UPDATE: "courses.update",
  COURSES_ARCHIVE: "courses.archive",
  ENROLMENTS_MANAGE: "enrolments.manage",
  
  MATERIALS_UPLOAD: "materials.upload",
  MATERIALS_PUBLISH: "materials.publish",
  MATERIALS_READ: "materials.read",
  
  ASSIGNMENTS_CREATE: "assignments.create",
  ASSIGNMENTS_UPDATE: "assignments.update",
  ASSIGNMENTS_PUBLISH: "assignments.publish",
  
  SUBMISSIONS_CREATE: "submissions.create",
  SUBMISSIONS_READ_OWN: "submissions.read_own",
  SUBMISSIONS_READ_COURSE: "submissions.read_course",
  
  ASSESSMENTS_CREATE: "assessments.create",
  ASSESSMENTS_UPDATE: "assessments.update",
  ASSESSMENTS_PUBLISH: "assessments.publish",
  ASSESSMENTS_TAKE: "assessments.take",
  
  GRADES_ENTER: "grades.enter",
  GRADES_RELEASE: "grades.release",
  GRADES_READ_OWN: "grades.read_own",
  
  ANNOUNCEMENTS_CREATE: "announcements.create",
  ANNOUNCEMENTS_PUBLISH: "announcements.publish",
  
  AUDIT_READ: "audit.read",
  SYSTEM_CONFIGURE: "system.configure",
} as const;

export type SystemPermission = (typeof SystemPermissions)[keyof typeof SystemPermissions];

export const DEFAULT_ROLE_PERMISSIONS: Record<SystemRole, SystemPermission[]> = {
  [SystemRoles.IT_ADMIN]: [
    SystemPermissions.USERS_READ,
    SystemPermissions.USERS_APPROVE,
    SystemPermissions.USERS_SUSPEND,
    SystemPermissions.ROLES_ASSIGN,
    SystemPermissions.AUDIT_READ,
    SystemPermissions.SYSTEM_CONFIGURE,
  ],
  [SystemRoles.ACADEMIC_ADMIN]: [
    SystemPermissions.USERS_READ,
    SystemPermissions.COURSES_READ,
    SystemPermissions.COURSES_CREATE,
    SystemPermissions.COURSES_UPDATE,
    SystemPermissions.COURSES_ARCHIVE,
    SystemPermissions.ENROLMENTS_MANAGE,
    SystemPermissions.ANNOUNCEMENTS_CREATE,
    SystemPermissions.ANNOUNCEMENTS_PUBLISH,
    SystemPermissions.AUDIT_READ,
  ],
  [SystemRoles.LECTURER]: [
    SystemPermissions.COURSES_READ,
    SystemPermissions.MATERIALS_UPLOAD,
    SystemPermissions.MATERIALS_PUBLISH,
    SystemPermissions.MATERIALS_READ,
    SystemPermissions.ASSIGNMENTS_CREATE,
    SystemPermissions.ASSIGNMENTS_UPDATE,
    SystemPermissions.ASSIGNMENTS_PUBLISH,
    SystemPermissions.SUBMISSIONS_READ_COURSE,
    SystemPermissions.ASSESSMENTS_CREATE,
    SystemPermissions.ASSESSMENTS_UPDATE,
    SystemPermissions.ASSESSMENTS_PUBLISH,
    SystemPermissions.GRADES_ENTER,
    SystemPermissions.GRADES_RELEASE,
    SystemPermissions.ANNOUNCEMENTS_CREATE,
    SystemPermissions.ANNOUNCEMENTS_PUBLISH,
  ],
  [SystemRoles.STUDENT]: [
    SystemPermissions.COURSES_READ,
    SystemPermissions.MATERIALS_READ,
    SystemPermissions.SUBMISSIONS_CREATE,
    SystemPermissions.SUBMISSIONS_READ_OWN,
    SystemPermissions.ASSESSMENTS_TAKE,
    SystemPermissions.GRADES_READ_OWN,
  ],
};
