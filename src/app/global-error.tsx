"use client";

import { useEffect } from "react";

// The last resort: the root layout itself failed, so nothing of the app (fonts, theme, styles) can
// be counted on. A page that stands on its own, with inline styles.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 24,
          background: "#f6f6fa",
          color: "#17112b",
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        }}
      >
        <main style={{ maxWidth: 440, textAlign: "center" }}>
          <h1 style={{ fontSize: 26, lineHeight: 1.15, margin: 0 }}>Yelema est momentanément indisponible</h1>
          <p style={{ fontSize: 15, lineHeight: 1.45, color: "#4a4563", margin: "12px 0 24px" }}>
            Réessayez dans un instant ; si cela continue, contactez Yelema.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              height: 48,
              padding: "0 24px",
              border: 0,
              borderRadius: 18,
              background: "#301667",
              color: "#ffffff",
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Réessayer
          </button>
        </main>
      </body>
    </html>
  );
}
