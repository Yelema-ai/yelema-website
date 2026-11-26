// How the tour moves between its steps and screens: a missing step of the screen on display is skipped, a
// screen this member does not have (no Expert yet) is passed over whole.
import type { TourPage, TourStep } from "./tour-steps.ts";

/** Where a screen of the tour opens; null when this member has none. */
export function pageHref(page: TourPage, firstExpertPath: string | null): string | null {
  if (page === "home") return "/";
  if (page === "integrations") return "/integrations/connecteurs";
  return firstExpertPath;
}

/** Whether `pathname` is that screen. */
export function isOnPage(page: TourPage, pathname: string, firstExpertPath: string | null): boolean {
  if (page === "home") return pathname === "/";
  if (page === "integrations") return pathname === "/integrations" || pathname.startsWith("/integrations/");
  return firstExpertPath !== null && (pathname === firstExpertPath || pathname.startsWith(`${firstExpertPath}/`));
}

/** The step to go to from `from` in `dir`; `null` when nothing is left that way. */
export function nextStepIndex(steps: readonly TourStep[], from: number, dir: 1 | -1, present: (s: TourStep) => boolean, firstExpertPath: string | null): number | null {
  const here = steps[from]?.page;
  for (let i = from + dir; i >= 0 && i < steps.length; i += dir) {
    const s = steps[i]!;
    if (s.page === here ? present(s) : pageHref(s.page, firstExpertPath) !== null) return i;
  }
  return null;
}

/** The steps of the screen of `index`, from it in the direction of travel. */
export function pageRun(steps: readonly TourStep[], index: number, dir: 1 | -1): number[] {
  const page = steps[index]?.page;
  const run: number[] = [];
  for (let i = index; i >= 0 && i < steps.length && steps[i]!.page === page; i += dir) run.push(i);
  return run;
}
