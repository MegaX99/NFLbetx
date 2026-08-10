const PENDING_INVITE_KEY = "nflbetx.pending-invite";
const PENDING_INVITE_LIFETIME = 7 * 24 * 60 * 60 * 1000;

type StoredInvite = {
  code: string;
  expiresAt: number;
};

export function normalizeInviteCode(value?: string | null) {
  const code = value?.trim().toUpperCase() ?? "";
  return code && code.length <= 40 ? code : "";
}

export function rememberPendingInvite(value?: string | null) {
  const code = normalizeInviteCode(value);
  if (!code || typeof window === "undefined") return code;

  const pendingInvite: StoredInvite = {
    code,
    expiresAt: Date.now() + PENDING_INVITE_LIFETIME,
  };
  try {
    window.localStorage.setItem(PENDING_INVITE_KEY, JSON.stringify(pendingInvite));
  } catch {
    // The URL still carries the code when browser storage is unavailable.
  }
  return code;
}

export function readPendingInvite() {
  if (typeof window === "undefined") return "";

  try {
    const pendingInvite = JSON.parse(window.localStorage.getItem(PENDING_INVITE_KEY) ?? "null") as StoredInvite | null;
    if (!pendingInvite || pendingInvite.expiresAt <= Date.now()) {
      window.localStorage.removeItem(PENDING_INVITE_KEY);
      return "";
    }
    return normalizeInviteCode(pendingInvite.code);
  } catch {
    window.localStorage.removeItem(PENDING_INVITE_KEY);
    return "";
  }
}

export function clearPendingInvite() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PENDING_INVITE_KEY);
  } catch {
    // Nothing else is required when browser storage is unavailable.
  }
}

export function resolvePendingInvite(params: URLSearchParams) {
  const fromUrl = normalizeInviteCode(params.get("invite") ?? params.get("code"));
  return fromUrl ? rememberPendingInvite(fromUrl) : readPendingInvite();
}

export function invitationDestination(path: string, code: string, parameter = "invite") {
  if (!code) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${parameter}=${encodeURIComponent(code)}`;
}
