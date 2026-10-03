import "server-only";
import type { DB } from "@/lib/auth";
import { ApiError } from "@/lib/http";

// Access links sign a teammate in without a password and land them on /bienvenue, where they set
// one. They serve both "Ajouter un admin" and "lien de réinitialisation". Each is a row in
// `invitations` (token, workspace, email): valid 7 days, used once, and only consumed by a POST from
// the /acces page, so link previews and mail scanners that GET it don't burn it. They don't depend
// on Supabase's own email links (1 h expiry, SMTP), so copying the link by hand always works.

export function normalizeEmail(raw: unknown): string {
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, "invalid_email", "Adresse e-mail invalide");
  return email;
}

async function findUserId(db: DB, email: string): Promise<string | null> {
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new ApiError(500, "auth_error", error.message);
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
}

// The auth user for an email, created (already confirmed, no password yet) when it doesn't exist.
export async function ensureAuthUser(db: DB, email: string): Promise<string> {
  const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true });
  if (data.user) return data.user.id;
  const existing = await findUserId(db, email);
  if (existing) return existing;
  throw new ApiError(500, "auth_error", error?.message ?? "Impossible de créer le compte");
}

export async function createAccessLink(
  db: DB,
  input: { workspaceId: string; email: string; createdBy: string | null; origin: string }
): Promise<string> {
  const { data, error } = await db
    .from("invitations")
    .insert({ workspace_id: input.workspaceId, email: input.email, role: "admin", created_by: input.createdBy })
    .select("token")
    .single();
  if (error) throw new ApiError(500, "db_error", error.message);
  return `${input.origin}/acces/${data.token}`;
}

export interface AccessLink {
  token: string;
  workspace_id: string;
  email: string;
  expires_at: string;
}

export async function readAccessLink(db: DB, token: string): Promise<AccessLink | null> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
  const { data } = await db
    .from("invitations")
    .select("token, workspace_id, email, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!data?.email || new Date(data.expires_at).getTime() < Date.now()) return null;
  return data as AccessLink;
}
