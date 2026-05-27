const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3010";

export function getApiBase() {
  return API_BASE.replace(/\/$/, "");
}

export async function apiFetch(path, { token, ...init } = {}) {
  const headers = new Headers(init.headers ?? {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${getApiBase()}${path}`, { ...init, headers });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }
  if (!res.ok) {
    const msg = data?.message ?? data?.error ?? res.statusText;
    throw new Error(Array.isArray(msg) ? msg.join(", ") : String(msg));
  }
  return data;
}
