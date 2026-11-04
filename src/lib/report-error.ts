// A screen that failed to render tells the app's server what broke (message, stack, page without its query),
// so it lands in the server logs: the browser console is out of reach. Never the page content.
export function reportClientError(error: Error & { digest?: string }, where: string): void {
  try {
    const body = JSON.stringify({
      where,
      message: String(error?.message ?? error).slice(0, 500),
      stack: String(error?.stack ?? "").slice(0, 4000),
      digest: error?.digest ?? null,
      path: window.location.pathname,
    });
    if (!navigator.sendBeacon?.("/api/client-error", new Blob([body], { type: "application/json" }))) {
      void fetch("/api/client-error", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => undefined);
    }
  } catch {
    /* reporting never breaks the error screen */
  }
}
