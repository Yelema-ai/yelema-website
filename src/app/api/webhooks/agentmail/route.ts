import { NextResponse } from "next/server";

// Endpoint public pour recevoir les événements AgentMail (message.received, etc.)
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const event = await request.json();
    console.log("[AgentMail Webhook] Événement reçu :", event.event_type || event.type, event.id);

    // Si un e-mail est reçu
    if (event.event_type === "message.received" || event.type === "message.received") {
      const message = event.data?.message || event.message || event.data;
      console.log(`[AgentMail Webhook] Nouveau message de ${message?.from} vers ${message?.to} - Sujet: ${message?.subject}`);
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("[AgentMail Webhook] Erreur traitement webhook :", err);
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
