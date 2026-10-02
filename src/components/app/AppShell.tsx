"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/app/Sidebar";
import { TopBar } from "@/components/app/TopBar";

const COLLAPSE_KEY = "sbmini";

/**
 * Le cadre unique de l'application : menu à gauche, barre en haut, contenu à droite.
 *
 * Il n'y a qu'une coquille, pour tout : l'espace d'un expert s'ouvre dedans, et c'est
 * ce qui supprime l'écran de choix d'instance du kit — la liste des experts est en
 * permanence dans le menu.
 *
 * Le <main> ne pose aucune marge : chaque page choisit son mode en enveloppant ou non
 * son contenu dans <Page>.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      // Stockage indisponible : le menu s'ouvre déplié, ce qui est le bon défaut.
    }
  }, []);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        // Le choix ne survivra pas au rechargement.
      }
      return next;
    });
  }

  return (
    <div
      className="grid min-h-screen"
      style={{ gridTemplateColumns: `${collapsed ? 72 : 250}px minmax(0,1fr)` }}
    >
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <main className="flex min-w-0 flex-col">
        <TopBar />
        {children}
      </main>
    </div>
  );
}
