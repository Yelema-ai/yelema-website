// What the user reads when an answer carries no sentence of its own (a host's error page, a
// crashed route): never a status code or a raw body.
const FAILED = "Une erreur est survenue. Réessayez dans un instant.";

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
    const message = (data as { error?: { message?: string } })?.error?.message;
    throw new Error(message || FAILED);
  }
  return data as T;
}

// Pull the API's { error: { message } } off a non-ok Response for the manual fetch callers
// (streaming / multipart bodies that can't go through apiFetch), falling back to a status code.
export async function readApiError(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message || `${fallback}.`;
}
