"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { MembersView } from "@/components/MembersView";
import { PageBody } from "@/components/app/PageBody";
import { useWorkspace } from "@/components/WorkspaceProvider";

// Administration : pour un admin, la liste des membres de l'espace, en lecture (l'espace, ses
// membres et leurs instances se gèrent dans le back-office Yelema). Un membre n'a ici que ses
// connecteurs et ses canaux : il est renvoyé sur le premier.
export default function Page() {
  const router = useRouter();
  const { current } = useWorkspace();
  const admin = current?.role === "admin";

  useEffect(() => {
    if (current && !admin) router.replace("/administration/connecteurs");
  }, [current, admin, router]);

  if (!admin) return null;
  return (
    <PageBody>
      <MembersView />
    </PageBody>
  );
}
