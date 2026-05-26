import { apiErrorMessage } from "./apiErrors";
import { apiPath, normalizeApiAssetUrl } from "./apiPath";

export interface AuthUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  avatarShape: "circle" | "rounded";
  email: string | null;
  twoFactorEnabled: boolean;
  deactivatedAt: string | null;
  deleteAfter: string | null;
}

async function parseAuthResponse(response: Response): Promise<{ user: AuthUser | null }> {
  const payload = (await response.json().catch(() => null)) as { user?: AuthUser | null; error?: string } | null;
  if (!response.ok) {
    throw new Error(apiErrorMessage(response, payload?.error ?? "Auth request failed."));
  }
  return { user: normalizeAuthUser(payload?.user ?? null) };
}

function normalizeAuthUser(user: AuthUser | null): AuthUser | null {
  return user
    ? {
        ...user,
        avatarUrl: normalizeApiAssetUrl(user.avatarUrl),
        avatarShape: user.avatarShape === "rounded" ? "rounded" : "circle",
        twoFactorEnabled: Boolean(user.twoFactorEnabled)
      }
    : null;
}

export async function loadCurrentUser(): Promise<AuthUser | null> {
  const payload = await parseAuthResponse(await fetch(apiPath("auth/me")));
  return payload.user;
}

export async function devLogin(profile: { displayName: string; email?: string | null; avatarUrl?: string | null }): Promise<AuthUser | null> {
  const payload = await parseAuthResponse(
    await fetch(apiPath("auth/dev-login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile)
    })
  );
  return payload.user;
}

export async function updateProfile(profile: { displayName: string; avatar?: File | null; removeAvatar?: boolean }): Promise<AuthUser | null> {
  const body = new FormData();
  body.set("displayName", profile.displayName);
  if (profile.removeAvatar) {
    body.set("removeAvatar", "true");
  }
  if (profile.avatar) {
    body.set("avatar", profile.avatar);
  }
  const payload = await parseAuthResponse(await fetch(apiPath("auth/profile"), { method: "PATCH", body }));
  return payload.user;
}

export interface TwoFactorSetup {
  secret: string;
  otpauthUri: string;
  qrCodeSvg: string;
}

async function parseTwoFactorResponse(response: Response): Promise<{ user: AuthUser | null; recoveryCodes: string[] }> {
  const payload = (await response.json().catch(() => null)) as { user?: AuthUser | null; recoveryCodes?: string[]; error?: string } | null;
  if (!response.ok) {
    throw new Error(apiErrorMessage(response, payload?.error ?? "Two-factor request failed."));
  }
  return { user: normalizeAuthUser(payload?.user ?? null), recoveryCodes: payload?.recoveryCodes ?? [] };
}

export async function startTwoFactorSetup(): Promise<TwoFactorSetup> {
  const response = await fetch(apiPath("auth/two-factor/setup"), { method: "POST" });
  const payload = (await response.json().catch(() => null)) as (TwoFactorSetup & { error?: string }) | null;
  if (!response.ok || !payload) {
    throw new Error(apiErrorMessage(response, payload?.error ?? "Two-factor setup failed."));
  }
  return { secret: payload.secret, otpauthUri: payload.otpauthUri, qrCodeSvg: payload.qrCodeSvg };
}

export async function enableTwoFactor(code: string): Promise<{ user: AuthUser | null; recoveryCodes: string[] }> {
  return parseTwoFactorResponse(
    await fetch(apiPath("auth/two-factor/enable"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code })
    })
  );
}

export async function disableTwoFactor(code: string): Promise<AuthUser | null> {
  const payload = await parseTwoFactorResponse(
    await fetch(apiPath("auth/two-factor/disable"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code })
    })
  );
  return payload.user;
}

export async function deactivateProfile(confirmation: string): Promise<AuthUser | null> {
  const payload = await parseAuthResponse(
    await fetch(apiPath("auth/deactivate"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation })
    })
  );
  return payload.user;
}

export async function cancelProfileDeletion(): Promise<AuthUser | null> {
  const payload = await parseAuthResponse(await fetch(apiPath("auth/cancel-deletion"), { method: "POST" }));
  return payload.user;
}

export async function logout(): Promise<void> {
  const response = await fetch(apiPath("auth/logout"), { method: "POST" });
  if (!response.ok) {
    throw new Error("Logout failed.");
  }
}
