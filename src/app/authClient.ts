import { apiErrorMessage } from "./apiErrors";

export interface AuthUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  email: string | null;
  deactivatedAt: string | null;
  deleteAfter: string | null;
}

async function parseAuthResponse(response: Response): Promise<{ user: AuthUser | null }> {
  const payload = (await response.json().catch(() => null)) as { user?: AuthUser | null; error?: string } | null;
  if (!response.ok) {
    throw new Error(apiErrorMessage(response, payload?.error ?? "Auth request failed."));
  }
  return { user: payload?.user ?? null };
}

export async function loadCurrentUser(): Promise<AuthUser | null> {
  const payload = await parseAuthResponse(await fetch("/api/auth/me"));
  return payload.user;
}

export async function devLogin(profile: { displayName: string; email?: string | null; avatarUrl?: string | null }): Promise<AuthUser | null> {
  const payload = await parseAuthResponse(
    await fetch("/api/auth/dev-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile)
    })
  );
  return payload.user;
}

export async function updateProfile(profile: { displayName: string; avatar?: File | null }): Promise<AuthUser | null> {
  const body = new FormData();
  body.set("displayName", profile.displayName);
  if (profile.avatar) {
    body.set("avatar", profile.avatar);
  }
  const payload = await parseAuthResponse(await fetch("/api/auth/profile", { method: "PATCH", body }));
  return payload.user;
}

export async function deactivateProfile(confirmation: string): Promise<AuthUser | null> {
  const payload = await parseAuthResponse(
    await fetch("/api/auth/deactivate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation })
    })
  );
  return payload.user;
}

export async function cancelProfileDeletion(): Promise<AuthUser | null> {
  const payload = await parseAuthResponse(await fetch("/api/auth/cancel-deletion", { method: "POST" }));
  return payload.user;
}

export async function logout(): Promise<void> {
  const response = await fetch("/api/auth/logout", { method: "POST" });
  if (!response.ok) {
    throw new Error("Logout failed.");
  }
}
