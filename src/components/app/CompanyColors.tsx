"use client";

import { useEffect, useState } from "react";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { usePublicConfig } from "@/components/PublicConfigProvider";

const HEX = /^#[0-9a-f]{6}$/i;

// The most present strong color of a logo: pixels too pale, too dark, too grey or transparent are
// left out, the rest counted by coarse buckets. Null when the picture cannot be read (another
// host without CORS) or has no such color.
function logoColor(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onerror = () => resolve(null);
    img.onload = () => {
      try {
        const size = 48;
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        const buckets = new Map<string, { n: number; r: number; g: number; b: number }>();
        for (let i = 0; i < data.length; i += 4) {
          const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          if (a < 200 || max < 40 || min > 215 || max - min < 60) continue;
          const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
          const k = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
          buckets.set(key, { n: k.n + 1, r: k.r + r, g: k.g + g, b: k.b + b });
        }
        const best = [...buckets.values()].sort((x, y) => y.n - x.n)[0];
        if (!best || best.n < 12) return resolve(null);
        const hex = (v: number) => Math.round(v / best.n).toString(16).padStart(2, "0");
        resolve(`#${hex(best.r)}${hex(best.g)}${hex(best.b)}`);
      } catch {
        resolve(null);
      }
    };
    img.src = url;
  });
}

/**
 * Habille l'espace aux couleurs de l'entreprise cliente : sa couleur principale et ses teintes
 * remplacent le violet Yelema (boutons, onglet actif, fonds teintés). La couleur vient du back
 * office (`brand_color`) ; sans elle, de son logo ; sans les deux, le violet Yelema reste.
 * Police, icônes, couleurs d'état, Yélé et « Powered by Yelema » ne changent pas.
 */
export function CompanyColors() {
  const { current } = useWorkspace();
  const deploymentLogo = usePublicConfig().logoUrl;
  const logoUrl = current?.logo_url ?? deploymentLogo;
  const given = current?.brand_color && HEX.test(current.brand_color) ? current.brand_color : null;
  const [fromLogo, setFromLogo] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setFromLogo(null);
    if (!given && logoUrl) void logoColor(logoUrl).then((c) => live && setFromLogo(c));
    return () => {
      live = false;
    };
  }, [given, logoUrl]);

  const c = given ?? fromLogo;
  if (!c) return null;
  // Light: the color as fill and as text, its pale mixes as tints. Dark: the same fill, a lighter
  // text and deep tints. The theme's greys lean violet (Yelema's): they turn neutral, with a trace
  // of the company's color, so no Yelema background is left. `html:root` and `html.dark` outrank
  // the theme's own `:root` and `.dark`.
  const css = `html:root{--brand:${c};--brand-ink:${c};--call:${c};--call-ink:color-mix(in srgb,${c} 85%,#000);--primary:${c};--ring:${c};--link:${c};--tint:color-mix(in srgb,${c} 9%,#fff);--tint-2:color-mix(in srgb,${c} 16%,#fff);--bg:color-mix(in srgb,${c} 2%,#f6f6f6);--soft:color-mix(in srgb,${c} 3%,#f2f2f2);--soft-2:color-mix(in srgb,${c} 4%,#e8e8e8);--line:rgba(20,16,20,.1);--ink:#171417;--ink-2:#4a464b;--ink-3:#646066}
html.dark{--brand:${c};--call:${c};--call-ink:color-mix(in srgb,${c} 45%,#fff);--brand-ink:color-mix(in srgb,${c} 45%,#fff);--primary:${c};--ring:${c};--link:color-mix(in srgb,${c} 45%,#fff);--tint:color-mix(in srgb,${c} 18%,#171417);--tint-2:color-mix(in srgb,${c} 26%,#171417);--bg:#111011;--soft:#1f1d20;--soft-2:#29272a;--surface:#19171a;--ink:#f3f2f3;--ink-2:#c9c5ca;--ink-3:#a19ca3}`;
  return <style>{css}</style>;
}
