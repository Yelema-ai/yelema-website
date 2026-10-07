import type { Metadata } from "next";
import { Funnel_Sans, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { branding } from "@/config/branding";
import { PublicConfigProvider } from "@/components/PublicConfigProvider";
import { requestPublicConfig } from "@/lib/tenant";
import { THEME_BOOTSTRAP } from "@/lib/theme";

// Charte Yelema : Funnel Sans pour l'interface, Space Grotesk pour les chiffres, les
// salutations et les prénoms des experts (classe `.num`, cf. globals.css).
const funnelSans = Funnel_Sans({
  subsets: ["latin"],
  variable: "--font-funnel-sans",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
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
    <html lang="fr" className={`${funnelSans.variable} ${spaceGrotesk.variable}`}>
      <head>
        {/* Pose la classe `dark` avant le premier rendu : sans ça, l'écran clignote en clair. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <PublicConfigProvider config={config}>{children}</PublicConfigProvider>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
