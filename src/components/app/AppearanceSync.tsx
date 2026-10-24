"use client";

import { useEffect } from "react";
import { applyAppearance, readAppearance } from "@/lib/theme";

// L'apparence se choisit dans Paramètres (Leslie, 24/10 : plus de soleil dans la barre du haut, comme
// ChatGPT). Ici, sans rien afficher : en mode automatique, suivre le système quand il change.
export function AppearanceSync() {
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => readAppearance() === "auto" && applyAppearance("auto");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return null;
}
