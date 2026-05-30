/** Display labels for JWT role from /auth/firebase/session */
export const STAFF_ROLE_LABELS = {
  superuser: "Superuser",
  admin: "Admin",
  treasurer: "Treasurer",
  accountant: "Accountant",
  general_manager: "General Manager",
  chairman: "Chairperson / Chairman",
};

export function staffRoleLabel(role) {
  return STAFF_ROLE_LABELS[role] ?? role ?? "Staff";
}

export function canManageStaffAccess(role, superuser) {
  return superuser === true || role === "superuser";
}
