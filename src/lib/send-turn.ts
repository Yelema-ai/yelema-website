// « Envoyer » on a deliverable, followed in the deliverable itself (Djénéba's notes and Leslie, 26/11: the
// agreement was asked in a new conversation nobody knew about). The turn's stream events, reduced to what
// the window shows. No imports from `@/`, so `node --test` runs it as is.

export type SendPhase = "starting" | "working" | "waiting" | "sent" | "failed";

export interface SendApproval {
  requestId: string;
  message: string;
  expiresAt: number;
}

export interface SendTurn {
  phase: SendPhase;
  sessionId: string | null;
  responseId: string | null;
  /** An agreement the expert asks for and the window did not give by itself. */
  approval: SendApproval | null;
  /** The expert's answer so far (its last words once the turn ends). */
  text: string;
  /** The expert's current step, in French, while it works (set by the caller, `toolPhrase`). */
  step: string | null;
}

export const SEND_START: SendTurn = { phase: "starting", sessionId: null, responseId: null, approval: null, text: "", step: null };

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

const DEFAULT_WAIT_MS = 300_000;

/** One stream event applied. `approval_requested` is left to the caller, which knows whether the window already said yes. */
export function sendEvent(s: SendTurn, event: string, data: Record<string, unknown>): SendTurn {
  switch (event) {
    case "response.created":
      return { ...s, phase: s.phase === "starting" ? "working" : s.phase, responseId: str(data.id) ?? s.responseId, sessionId: str(data.session_id) ?? s.sessionId };
    case "response.output_text.delta":
      return typeof data.text === "string" ? { ...s, text: s.text + data.text } : s;
    // What it said before a tool is narration: the window keeps only the words after the last one.
    case "response.tool_call.started":
      return { ...s, text: "" };
    case "response.approval_resolved":
      return s.approval && str(data.request_id) === s.approval.requestId ? { ...s, approval: null, phase: "working" } : s;
    case "response.completed":
      return { ...s, phase: "sent", approval: null, step: null, text: str(data.output_text) ?? s.text };
    case "response.failed":
      return { ...s, phase: "failed", approval: null, step: null };
    default:
      return s;
  }
}

/** The agreement the expert waits for, shown in the window until answered or past its time. */
export function askApproval(s: SendTurn, data: Record<string, unknown>, now = Date.now()): SendTurn {
  const requestId = str(data.request_id);
  if (!requestId) return s;
  const expires = typeof data.expires_at === "string" ? Date.parse(data.expires_at) : NaN;
  return {
    ...s,
    phase: "waiting",
    approval: { requestId, message: str(data.message) ?? "Votre Expert demande votre accord avant d’envoyer.", expiresAt: Number.isFinite(expires) ? expires : now + DEFAULT_WAIT_MS },
  };
}

/** The window's answer is on its way: the card goes, the turn goes on. */
export const answered = (s: SendTurn): SendTurn => ({ ...s, approval: null, phase: s.phase === "waiting" ? "working" : s.phase });
