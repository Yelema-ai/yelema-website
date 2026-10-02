import type { Metadata } from "next";
import { Funnel_Sans, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { branding } from "@/config/branding";
import { PublicConfigProvider } from "@/components/PublicConfigProvider";
import { publicConfig } from "@/lib/runtime-config";
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

// Rendered per request: the public config comes from the container's env at runtime, and a
// prerendered page would freeze whatever env the build happened to have.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: branding.appName,
  description:
    "Une IA pensée pour l'Afrique, prête à l'emploi, au service de vos équipes.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${funnelSans.variable} ${spaceGrotesk.variable}`}>
      <head>
        {/* Pose la classe `dark` avant le premier rendu : sans ça, l'écran clignote en clair. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <PublicConfigProvider config={publicConfig()}>{children}</PublicConfigProvider>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
