import type { Metadata } from "next";
import { Bricolage_Grotesque, Onest } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { branding } from "@/config/branding";

const onest = Onest({ subsets: ["latin"], variable: "--font-onest", display: "swap" });
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-bricolage",
  display: "swap",
});

export const metadata: Metadata = {
  title: branding.appName,
  description: "Vos experts IA, au service de votre équipe.",
  icons: { icon: "/yelema_y.svg" },
};

// Chrome's Translate swaps the page's text for its own nodes, so when React later moves or removes
// that text (a routine turned on, a message streamed in) the node is gone and the page crashes.
// Removing or inserting around a node that has already moved is skipped instead; the translated
// text may lag a re-render, the page stays up (facebook/react#11538).
const TRANSLATE_GUARD = `(() => {
  const remove = Node.prototype.removeChild;
  Node.prototype.removeChild = function (child) {
    return child.parentNode === this ? remove.call(this, child) : child;
  };
  const insert = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function (node, ref) {
    return ref && ref.parentNode !== this ? node : insert.call(this, node, ref);
  };
})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${onest.variable} ${bricolage.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: TRANSLATE_GUARD }} />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
