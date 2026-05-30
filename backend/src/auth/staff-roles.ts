import { StaffRole } from "@prisma/client";

/** JWT `role` claim — one string per accounting staff title. */
export type StaffJwtRole =
  | "superuser"
  | "admin"
  | "treasurer"
  | "accountant"
  | "general_manager"
  | "chairman";

export const STAFF_JWT_ROLES: StaffJwtRole[] = [
  "superuser",
  "admin",
  "treasurer",
  "accountant",
  "general_manager",
  "chairman",
];

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  [StaffRole.SUPERUSER]: "Superuser",
  [StaffRole.ADMIN]: "Admin",
  [StaffRole.TREASURER]: "Treasurer",
  [StaffRole.ACCOUNTANT]: "Accountant",
  [StaffRole.GENERAL_MANAGER]: "General Manager",
  [StaffRole.CHAIRMAN]: "Chairperson / Chairman",
};

/** Roles a superuser can assign in Staff access (excludes SUPERUSER via API guard). */
export const ASSIGNABLE_STAFF_ROLES: StaffRole[] = [
  StaffRole.TREASURER,
  StaffRole.ACCOUNTANT,
  StaffRole.GENERAL_MANAGER,
  StaffRole.CHAIRMAN,
  StaffRole.ADMIN,
];

export function staffRoleToJwt(role: StaffRole): StaffJwtRole {
  switch (role) {
    case StaffRole.SUPERUSER:
      return "superuser";
    case StaffRole.TREASURER:
      return "treasurer";
    case StaffRole.ACCOUNTANT:
      return "accountant";
    case StaffRole.GENERAL_MANAGER:
      return "general_manager";
    case StaffRole.CHAIRMAN:
      return "chairman";
    case StaffRole.ADMIN:
    default:
      return "admin";
  }
}

export function isStaffJwtRole(value: string): value is StaffJwtRole {
  return (STAFF_JWT_ROLES as string[]).includes(value);
}

export function canManageStaffAccess(jwtRole: StaffJwtRole): boolean {
  return jwtRole === "superuser";
}
