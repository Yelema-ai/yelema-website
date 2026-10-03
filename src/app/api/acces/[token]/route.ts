import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { ensureAuthUser, readAccessLink } from "@/lib/access-links";
import { WORKSPACE_COOKIE } from "@/lib/workspace";

type Ctx = { params: Promise<{ token: string }> };

// Consume an access link: sign its email in (a server-side magic-link exchange, so no Supabase email
// or redirect setting is involved), make sure they're an admin of the workspace, open that
// workspace, and send them to /bienvenue to set their password.
export async function POST(request: Request, { params }: Ctx) {
  const { token } = await params;
  const origin = new URL(request.url).origin;
  const fail = () => NextResponse.redirect(new URL(`/acces/${token}?e=1`, origin), 303);

  const db = createAdminClient();
  const link = await readAccessLink(db, token);
  if (!link) return fail();

  try {
    const userId = await ensureAuthUser(db, link.email);
    const { error: memErr } = await db
      .from("memberships")
      .upsert({ workspace_id: link.workspace_id, user_id: userId, role: "admin" }, { onConflict: "workspace_id,user_id" });
    if (memErr) throw memErr;

    const { data, error } = await db.auth.admin.generateLink({ type: "magiclink", email: link.email });
    if (error || !data.properties?.hashed_token) throw error ?? new Error("no token");
    const supabase = await createClient();
    const { error: otpErr } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: data.properties.hashed_token });
    if (otpErr) throw otpErr;

    await db.from("invitations").delete().eq("token", token);
    (await cookies()).set(WORKSPACE_COOKIE, link.workspace_id, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
    return NextResponse.redirect(new URL("/bienvenue", origin), 303);
  } catch (e) {
    console.error("[acces]", e);
    return fail();
  }
}
