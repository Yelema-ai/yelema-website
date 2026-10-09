import type { Metadata } from "next";
import { Bricolage_Grotesque, Onest } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { branding } from "@/config/branding";
import { PublicConfigProvider } from "@/components/PublicConfigProvider";
import { requestPublicConfig } from "@/lib/tenant";
import { THEME_BOOTSTRAP } from "@/lib/theme";

// Onest for the interface, Bricolage Grotesque for headings, greetings and expert names
// (`font-display`).
const onest = Onest({ subsets: ["latin"], variable: "--font-onest", display: "swap" });
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-bricolage",
  display: "swap",
});

// Rendered per request: the public config comes from the env at runtime and, when one deployment
// serves every client, from the request's host. A prerendered page would freeze both.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: branding.appName,
  description:
    "Une IA pensée pour l'Afrique, prête à l'emploi, au service de vos équipes.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const config = await requestPublicConfig();
  return (
    // THEME_BOOTSTRAP adds `dark` to this element before React hydrates it.
    <html lang="fr" className={`${onest.variable} ${bricolage.variable}`} suppressHydrationWarning>
      <head>
        {/* Pose la classe `dark` avant le premier rendu : sans ça, l'écran clignote en clair. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <PublicConfigProvider config={config}>{children}</PublicConfigProvider>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
