import Link from "next/link";
import { AuthShell, AuthHeading } from "@/components/auth/AuthShell";

// An address that leads nowhere, outside the signed-in frame.
export default function NotFound() {
  return (
    <AuthShell>
      <AuthHeading title="Page introuvable">Cette adresse ne mène nulle part, ou n’existe plus.</AuthHeading>
      <Link
        href="/"
        className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand px-6 text-[15px] font-semibold text-on-brand hover:opacity-90"
      >
        Revenir à l’accueil
      </Link>
    </AuthShell>
  );
}
