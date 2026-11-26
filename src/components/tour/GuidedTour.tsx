"use client";

import "driver.js/dist/driver.css";
import "./guided-tour.css";
import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Driver } from "driver.js";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { usePublicConfig } from "@/components/PublicConfigProvider";
import { useExpertsContext } from "@/components/experts/ExpertsProvider";
import { expertRank } from "@/lib/expert-cycle";
import { expertPath } from "@/lib/expert-tabs";
import { markTourSeen, tourSeen } from "@/lib/tour-seen";
import { TOUR_STEPS, tourSelector } from "./tour-steps";
import { WAIT_MS, loadDriver, runTour, type TourMenu } from "./tour-runner";
import { waitForElement } from "./wait-for-element";

export type { TourMenu };

/** The member's first visit: the tour starts on the home screen, once, unless already seen. */
export function GuidedTour({ onMenu }: { onMenu: (menu: TourMenu) => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const { current, userEmail } = useWorkspace();
  const viaBackoffice = usePublicConfig().authVia === "backoffice";
  const { experts } = useExpertsContext();
  const first = [...experts].sort((a, b) => expertRank(a) - expertRank(b))[0];
  const firstExpertPath = first ? expertPath(first.agentId, first.profileId) : null;
  // The tour outlives renders: it reads the latest router, menu setter and Expert through this.
  const live = useRef({ router, onMenu, firstExpertPath });
  live.current = { router, onMenu, firstExpertPath };
  const asked = useRef(false);
  const tour = useRef<Driver | null>(null);

  useEffect(() => () => tour.current?.destroy(), []);

  const workspaceId = current?.id ?? null;
  useEffect(() => {
    if (asked.current || pathname !== "/" || !workspaceId || !userEmail) return;
    asked.current = true;
    let cancelled = false;
    let settled = false;
    void (async () => {
      // The seen check, the home's first step and driver.js run side by side.
      const loaded = loadDriver().then(() => true, () => false);
      const shown = waitForElement(tourSelector(TOUR_STEPS[0]!), WAIT_MS);
      const seen = await tourSeen(userEmail, viaBackoffice);
      if (cancelled) return;
      if (seen) {
        settled = true;
        return;
      }
      const [anchor, ready] = await Promise.all([shown, loaded]);
      if (cancelled) return;
      if (!ready) {
        asked.current = false;
        settled = true;
        return;
      }
      settled = true;
      if (!anchor || window.location.pathname !== "/") return;
      tour.current = await runTour({
        navigate: (href) => live.current.router.push(href),
        menu: (menu) => live.current.onMenu(menu),
        firstExpertPath: () => live.current.firstExpertPath,
        ended: (outcome) => {
          tour.current = null;
          if (outcome === "interrupted") return;
          markTourSeen(userEmail);
          if (outcome === "finished" && window.location.pathname !== "/") live.current.router.push("/");
        },
      });
    })();
    return () => {
      cancelled = true;
      // Left before deciding (another screen, another workspace): asked again on the next home.
      if (!settled) asked.current = false;
    };
  }, [pathname, workspaceId, userEmail, viaBackoffice]);

  return null;
}
