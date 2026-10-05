"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/app/Sidebar";
import { TopBar } from "@/components/app/TopBar";
import { ExpertsProvider } from "@/components/experts/ExpertsProvider";
import { cn } from "@/lib/utils";

const COLLAPSE_KEY = "sbmini";

/**
 * Le cadre unique de l'application : menu à gauche, barre en haut, contenu à droite.
 *
 * Il n'y a qu'une coquille, pour tout : l'espace d'un expert s'ouvre dedans, et c'est
 * ce qui supprime l'écran de choix d'instance du kit — la liste des experts est en
 * permanence dans le menu.
 *
 * Sur téléphone le menu devient un tiroir : fermé par défaut, ouvert par le bouton de la
 * barre du haut, refermé à chaque navigation.
 *
 * Le <main> ne pose aucune marge : chaque page choisit son mode en enveloppant ou non
 * son contenu dans <Page>.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      // Stockage indisponible : le menu s'ouvre déplié, ce qui est le bon défaut.
    }
  }, []);

  // Une navigation depuis le tiroir le referme.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  function toggle() {
    // Dans le tiroir, le bouton du menu le referme au lieu de le replier.
    if (drawerOpen) {
      setDrawerOpen(false);
      return;
    }
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
    <ExpertsProvider>
      <div
        className="min-h-screen md:grid"
        style={{ gridTemplateColumns: `${collapsed ? 72 : 250}px minmax(0,1fr)` }}
      >
        {drawerOpen && (
          <button
            type="button"
            aria-label="Fermer le menu"
            onClick={() => setDrawerOpen(false)}
            className="fixed inset-0 z-30 bg-black/40 md:hidden"
          />
        )}
        <div
          className={cn(
            "fixed inset-y-0 left-0 z-40 w-[270px] transition-transform md:static md:z-auto md:w-auto md:translate-x-0",
            drawerOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <Sidebar collapsed={collapsed && !drawerOpen} onToggle={toggle} />
        </div>
        {/* Le <main> est la zone qui défile : la hauteur est bornée à l'écran pour que le chat et les
            fichiers gardent leur barre de saisie en bas, les pages longues défilant à l'intérieur. */}
        <main className="flex h-screen min-w-0 flex-col overflow-y-auto">
          <TopBar onMenu={() => setDrawerOpen(true)} />
          {children}
        </main>
      </div>
    </ExpertsProvider>
  );
}
