const STAFF_PROFILE_KEY = "b2c_accounting_staff_profile";

export function loadStaffProfile() {
  try {
    const raw = localStorage.getItem(STAFF_PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.email && parsed?.role) {
      return {
        email: parsed.email,
        role: parsed.role,
        superuser: parsed.superuser === true,
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function saveStaffProfile(profile) {
  if (!profile?.email || !profile?.role) {
    localStorage.removeItem(STAFF_PROFILE_KEY);
    return;
  }
  localStorage.setItem(
    STAFF_PROFILE_KEY,
    JSON.stringify({
      email: profile.email,
      role: profile.role,
      superuser: profile.superuser === true,
    }),
  );
}

export function clearStaffProfile() {
  localStorage.removeItem(STAFF_PROFILE_KEY);
}
