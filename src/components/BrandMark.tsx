"use client";

import { branding } from "@/config/branding";
import { usePublicConfig } from "@/components/PublicConfigProvider";

// Logo + app name shown at the top of each sidebar. BRAND_LOGO_URL (runtime) overrides the
// logo from src/config/branding.ts.
export function BrandMark() {
  const logoUrl = usePublicConfig().logoUrl ?? branding.logoUrl;
  return (
    <div className="flex items-center gap-2 px-2 py-1">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className="h-6 w-6 rounded" />
      ) : null}
      <span className="truncate font-semibold">{branding.appName}</span>
    </div>
  );
}
