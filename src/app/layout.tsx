import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "sonner";
import { branding } from "@/config/branding";
import { PublicConfigProvider } from "@/components/PublicConfigProvider";
import { publicConfig } from "@/lib/runtime-config";

// Rendered per request: the public config comes from the container's env at runtime, and a
// prerendered page would freeze whatever env the build happened to have.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: branding.appName,
  description: `${branding.appName} — managed AI agents`,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <PublicConfigProvider config={publicConfig()}>{children}</PublicConfigProvider>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
