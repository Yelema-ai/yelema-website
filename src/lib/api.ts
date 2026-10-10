// What the user reads when an answer carries no sentence of its own (a host's error page, a
// crashed route): never a status code or a raw body.
const FAILED = "Une erreur est survenue. Réessayez dans un instant.";

// Pages a visitor reaches without a session: a 401 there is an answer to what they typed (a wrong
// password, a spent link), not an expired session.
const PUBLIC_PAGES = /^\/(login|reset-password|invite|espace-)/;

// The session ended while the page was open (expired, or the member was suspended): every call now
// answers 401, and the screen would sit there with an error. Send the user to sign in instead, and
// back to where they were afterwards. True when the page is on its way out.
function leaveIfSignedOut(res: Response): boolean {
  if (res.status !== 401 || typeof window === "undefined") return false;
  if (PUBLIC_PAGES.test(window.location.pathname)) return false;
  const here = window.location.pathname + window.location.search;
  window.location.assign(`/login?expired=1&next=${encodeURIComponent(here)}`);
  return true;
}

const EXPIRED = "Votre session a expiré. Reconnectez-vous.";

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const text = await res.text();
  // A proxy or a crashed route can answer with an HTML page: fall back to a plain sentence, not a
  // parse error or the page itself.
  let data: unknown = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      if (res.ok) throw new Error(FAILED);
      data = {};
    }
  }
  if (!res.ok) {
    if (leaveIfSignedOut(res)) throw new Error(EXPIRED);
    const message = (data as { error?: { message?: string } })?.error?.message;
    throw new Error(message || FAILED);
  }
  return data as T;
}

// Pull the API's { error: { message } } off a non-ok Response for the manual fetch callers
// (streaming / multipart bodies that can't go through apiFetch), falling back to a status code.
export async function readApiError(res: Response, fallback: string): Promise<string> {
  if (leaveIfSignedOut(res)) return EXPIRED;
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message || `${fallback}.`;
}
