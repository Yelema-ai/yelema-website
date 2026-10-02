"use client";

import { createContext, useContext } from "react";
import type { PublicConfig } from "@/lib/runtime-config";

// The deployment's public configuration, read on the server at request time (see
// src/lib/runtime-config.ts) and handed to the browser by the root layout. Client code reads
// it from here instead of `process.env.NEXT_PUBLIC_*`, which would be frozen at build time.
const PublicConfigContext = createContext<PublicConfig | null>(null);

export function PublicConfigProvider({
  config,
  children,
}: {
  config: PublicConfig;
  children: React.ReactNode;
}) {
  return <PublicConfigContext.Provider value={config}>{children}</PublicConfigContext.Provider>;
}

export function usePublicConfig(): PublicConfig {
  const config = useContext(PublicConfigContext);
  if (!config) throw new Error("usePublicConfig must be used inside PublicConfigProvider");
  return config;
}
