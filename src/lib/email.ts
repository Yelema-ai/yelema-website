import "server-only";

// Emails go out through Resend when RESEND_API_KEY is set. Without it nothing fails: callers get
// `{ sent: false }` and the UI shows the link to copy instead.
export async function sendEmail(input: { to: string; subject: string; html: string; text: string }): Promise<{ sent: boolean }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM || "Yelema <no-reply@yelema.ai>", ...input }),
  });
  if (!res.ok) {
    console.error("[email] Resend failed", res.status, (await res.text()).slice(0, 300));
    return { sent: false };
  }
  return { sent: true };
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function accessEmail(input: { workspaceName: string; link: string; inviter: string | null; reset: boolean }) {
  const subject = input.reset
    ? `Votre lien d'accès à l'espace ${input.workspaceName} sur Yelema`
    : `Vous êtes invité(e) dans l'espace ${input.workspaceName} sur Yelema`;
  const intro = input.reset
    ? `Voici votre lien pour accéder à l'espace ${input.workspaceName} et choisir un nouveau mot de passe.`
    : `${input.inviter ? `${input.inviter} vous ajoute` : "Vous êtes ajouté(e)"} comme admin de l'espace ${input.workspaceName} sur Yelema, avec toute l'équipe d'experts IA de l'entreprise.`;
  const text = `${intro}\n\n${input.link}\n\nLe lien est valable 7 jours et ne sert qu'une fois.`;
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;color:#17112B;line-height:1.5">
<p>${escape(intro)}</p>
<p><a href="${escape(input.link)}" style="display:inline-block;background:#301667;color:#fff;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:600">Accéder à l'espace</a></p>
<p style="color:#625D7C;font-size:13px">Le lien est valable 7 jours et ne sert qu'une fois.</p></div>`;
  return { subject, text, html };
}
