// Runs the tour on the real screens: highlights each step, opens the next screen when the step is on another
// one, and says how it ended. It writes nothing anywhere: the caller records the outcome.
import type { Driver } from "driver.js";
import { TOUR_STEPS, tourSelector, type TourStep } from "./tour-steps";
import { isOnPage, nextStepIndex, pageHref, pageRun } from "./tour-navigation";
import { visibleElement, waitForElement } from "./wait-for-element";

/** What the shell does with its menu during the tour: as the member left it, open beside a screen, or shown. */
export type TourMenu = "off" | "page" | "menu";

/** Finished to the end, or left on purpose (× or Échap): both count as seen. `interrupted`: the page went away. */
export type TourOutcome = "finished" | "left" | "interrupted";

export interface TourHost {
  navigate: (href: string) => void;
  menu: (menu: TourMenu) => void;
  /** Read at each move: the member's Experts may arrive after the tour started. */
  firstExpertPath: () => string | null;
  ended: (outcome: TourOutcome) => void;
}

/** Longest wait for a screen opened by the tour. */
export const WAIT_MS = 8_000;
/** Longest wait for a `follows` step, on what the click before opened. */
const FOLLOW_MS = 3_000;
// The phone drawer slides in (`transition-transform`): the highlight is placed again once it is there.
const DRAWER_MS = 220;

let driverModule: Promise<typeof import("driver.js")> | null = null;
/** driver.js, loaded once; a failed load is tried again on the next call. */
export function loadDriver(): Promise<typeof import("driver.js")> {
  driverModule ??= import("driver.js").catch((e: unknown) => {
    driverModule = null;
    throw e;
  });
  return driverModule;
}

const visible = (step: TourStep) => visibleElement(tourSelector(step));
const present = (step: TourStep) => visible(step) !== null;
const narrow = () => window.matchMedia("(max-width: 767px)").matches;
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

export async function runTour(host: TourHost): Promise<Driver> {
  const { driver } = await loadDriver();
  const steps = TOUR_STEPS;
  let busy = false;
  let finished = false;

  /** The `follows` steps right after `from`, on its screen. */
  function followsAfter(from: number): TourStep[] {
    const run: TourStep[] = [];
    for (let i = from + 1; steps[i]?.follows && steps[i]!.page === steps[from]!.page; i++) run.push(steps[i]!);
    return run;
  }

  async function go(dir: 1 | -1): Promise<void> {
    const from = d.getActiveIndex();
    if (busy || from === undefined) return;
    busy = true;
    try {
      const following = dir === 1 ? followsAfter(from) : [];
      if (following.length > 0 && !following.some(present)) {
        await waitForElement(following.map(tourSelector).join(", "), FOLLOW_MS);
        if (!d.isActive()) return;
      }
      const expertPath = host.firstExpertPath();
      const to = nextStepIndex(steps, from, dir, present, expertPath);
      if (to === null) {
        if (dir === 1) {
          finished = true;
          d.destroy();
        }
        return;
      }
      const target = steps[to]!;
      if (target.page === steps[from]!.page) {
        d.moveTo(to);
        return;
      }
      if (!isOnPage(target.page, window.location.pathname, expertPath)) host.navigate(pageHref(target.page, expertPath)!);
      const run = pageRun(steps, to, dir);
      // A screen's first step in the list is always on it once it is open.
      const anchor = dir === 1 ? to : run[run.length - 1]!;
      await waitForElement(tourSelector(steps[anchor]!), WAIT_MS);
      if (d.isActive()) d.moveTo(run.find((i) => present(steps[i]!)) ?? anchor);
    } finally {
      busy = false;
    }
  }

  const d = driver({
    steps: steps.map((s) => ({
      element: () => visible(s) as Element,
      popover: {
        title: s.title,
        description: s.text,
        side: s.side,
        align: "start",
        // driver.js writes them as HTML: set again as text, so no text can ever carry markup.
        onPopoverRender: (popover) => {
          popover.title.textContent = s.title;
          popover.description.textContent = s.text;
        },
      },
      onHighlightStarted: () => {
        host.menu(s.menu ? "menu" : "page");
        if (s.menu && narrow()) setTimeout(() => d.isActive() && d.refresh(), DRAWER_MS);
      },
      onHighlighted: (el) => {
        if (s.click && el instanceof HTMLElement) el.click();
      },
    })),
    animate: true,
    smoothScroll: true,
    allowClose: true,
    overlayClickBehavior: "none",
    disableActiveInteraction: true,
    waitForElement: WAIT_MS,
    overlayOpacity: 0.55,
    stagePadding: 6,
    stageRadius: 12,
    popoverClass: "yelema-tour",
    nextBtnText: "Suivant",
    prevBtnText: "Précédent",
    doneBtnText: "Terminer",
    closeBtnLabel: "Passer la visite",
    onNextClick: () => void go(1),
    onPrevClick: () => void go(-1),
    onDestroyed: (_el, _step, { reason }) => {
      host.menu("off");
      host.ended(finished || reason === "done" ? "finished" : reason === "close" || reason === "escape" ? "left" : "interrupted");
    },
  });

  host.menu("page");
  await nextFrame();
  d.drive(0);
  return d;
}
