import assert from "node:assert/strict";
import { test } from "node:test";

import { isOnPage, nextStepIndex, pageHref, pageRun } from "./tour-navigation.ts";
import { TOUR_STEPS, type TourStep } from "./tour-steps.ts";

const EXPERT = "/experts/a1/client__marie";
const at = (id: string) => TOUR_STEPS.findIndex((s) => s.id === id);
const all = () => true;

test("every step has its own anchor, and each screen opens on a step always there", () => {
  assert.equal(new Set(TOUR_STEPS.map((s) => s.id)).size, TOUR_STEPS.length);
  const firstOfPage = TOUR_STEPS.filter((s, i) => i === 0 || TOUR_STEPS[i - 1]!.page !== s.page).map((s) => s.id);
  assert.deepEqual(firstOfPage, ["home-composer", "expert-tab-chat", "int-tab-connecteurs"]);
  assert.ok(TOUR_STEPS.every((s) => !s.click || !s.menu), "a menu step never clicks");
});

test("a step on what a click opened comes right after that click or another such step, on the same screen", () => {
  TOUR_STEPS.forEach((s, i) => {
    if (!s.follows) return;
    const before = TOUR_STEPS[i - 1];
    assert.ok((before?.click || before?.follows) && before.page === s.page && !s.menu, s.id);
  });
});

test("screens and their addresses", () => {
  assert.equal(pageHref("home", null), "/");
  assert.equal(pageHref("integrations", null), "/integrations/connecteurs");
  assert.equal(pageHref("expert", EXPERT), EXPERT);
  assert.equal(pageHref("expert", null), null);
  assert.ok(isOnPage("home", "/", EXPERT));
  assert.ok(!isOnPage("home", "/conversations", EXPERT));
  assert.ok(isOnPage("integrations", "/integrations/mcp", EXPERT));
  assert.ok(!isOnPage("integrations", "/integrationsx", EXPERT));
  assert.ok(isOnPage("expert", `${EXPERT}/files`, EXPERT));
  assert.ok(!isOnPage("expert", `${EXPERT}x/files`, EXPERT));
  assert.ok(!isOnPage("expert", EXPERT, null));
});

test("a missing step of the same screen is skipped, both ways", () => {
  const noVoice = (s: TourStep) => s.id !== "expert-call" && s.id !== "expert-tab-emails";
  assert.equal(nextStepIndex(TOUR_STEPS, at("expert-tab-calls"), 1, noVoice, EXPERT), at("expert-mail-create"));
  assert.equal(nextStepIndex(TOUR_STEPS, at("expert-mail-create"), -1, noVoice, EXPERT), at("expert-tab-calls"));
  const hasInbox = (s: TourStep) => s.id !== "expert-mail-create";
  assert.equal(nextStepIndex(TOUR_STEPS, at("expert-tab-emails"), 1, hasInbox, EXPERT), at("expert-mail-new"));
});

test("leaving a screen goes to the next one without looking at its elements", () => {
  const none = () => false;
  assert.equal(nextStepIndex(TOUR_STEPS, at("nav-experts"), 1, none, EXPERT), at("expert-tab-chat"));
  assert.equal(nextStepIndex(TOUR_STEPS, at("int-tab-connecteurs"), -1, none, EXPERT), at("routine-new"));
});

test("without an Expert, the Expert's screen is passed over", () => {
  assert.equal(nextStepIndex(TOUR_STEPS, at("nav-experts"), 1, all, null), at("int-tab-connecteurs"));
  assert.equal(nextStepIndex(TOUR_STEPS, at("int-tab-connecteurs"), -1, all, null), at("nav-experts"));
});

test("the ends of the tour", () => {
  assert.equal(nextStepIndex(TOUR_STEPS, TOUR_STEPS.length - 1, 1, all, EXPERT), null);
  assert.equal(nextStepIndex(TOUR_STEPS, 0, -1, all, EXPERT), null);
});

test("a screen's run, in the direction of travel", () => {
  const expert = TOUR_STEPS.flatMap((s, i) => (s.page === "expert" ? [i] : []));
  assert.deepEqual(pageRun(TOUR_STEPS, at("expert-tab-chat"), 1), expert);
  assert.deepEqual(pageRun(TOUR_STEPS, at("routine-new"), -1), [...expert].reverse());
});
