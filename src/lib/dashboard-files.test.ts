import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dashboardCandidates, dashboardFileIn, FRAME_CSP, inDashboardFolderOf, sharedHtmlKey, sharedLimits } from "./dashboard-files.ts";
import { legacyLink, namesFile } from "./dashboards.ts";

const FOLDERS = ["Djénéba", "Djeneba"];
const PAGE = "~/Livrables/Djénéba/tableau-de-bord/tableau-de-bord.html";
const RENDER = "https://yelema-dashboards.onrender.com/share/frame/11112222-3333-4444-5555-666677778888";

describe("fichiers d'un tableau partagé", () => {
  it("lit d'abord le fichier fixe, puis le chemin de l'état s'il est dans le dossier du tableau", () => {
    assert.deepEqual(dashboardCandidates(FOLDERS, null, ".html"), [PAGE, "~/Livrables/Djeneba/tableau-de-bord/tableau-de-bord.html"]);
    assert.deepEqual(dashboardCandidates(FOLDERS, "Livrables/Djeneba/tableau-de-bord/v2/page.html", ".html"), [
      "~/Livrables/Djeneba/tableau-de-bord/tableau-de-bord.html",
      PAGE,
      "~/Livrables/Djeneba/tableau-de-bord/v2/page.html",
    ]);
    assert.deepEqual(dashboardCandidates(FOLDERS, "/home/node/Livrables/Djénéba/tableau-de-bord/tableau-de-bord.html", ".html")[0], PAGE);
    assert.deepEqual(dashboardCandidates(["Awa"], "Livrables/Awa/tableau-de-bord/tableau-de-bord.pdf", ".pdf"), ["~/Livrables/Awa/tableau-de-bord/tableau-de-bord.pdf"]);
  });

  it("refuse la traversée, les autres dossiers et les autres extensions", () => {
    const refused = [
      "Livrables/Djénéba/tableau-de-bord/../../Mamadou/tableau-de-bord/tableau-de-bord.html",
      "Livrables/Djénéba/tableau-de-bord/./tableau-de-bord.html",
      "Livrables/Djénéba/tableau-de-bord//tableau-de-bord.html",
      "Livrables/Djénéba/tableau-de-bord/..\\secret.html",
      "Livrables/Djénéba/tableau-de-bord/%2e%2e/x.html",
      "Livrables/Djénéba/_memoire/state/page.html",
      "Livrables/Djénéba/page.html",
      "Livrables/Mamadou/tableau-de-bord/tableau-de-bord.html",
      "Livrables/Djénéba/tableau-de-bord/tableau-de-bord.js",
      "Livrables/Djénéba/tableau-de-bord/tableau-de-bord.html.json",
      "Livrables/Djénéba/tableau-de-bord/tableau-de-bord.pdf",
      ".hermes/profiles/djeneba/tableau-de-bord/tableau-de-bord.html",
      "/etc/tableau-de-bord/x.html",
      "~/.yelema/tableau-de-bord.html",
      "Livrables/Djénéba/tableau-de-bord",
      42,
      null,
    ];
    for (const raw of refused) assert.equal(dashboardFileIn(raw, FOLDERS, ".html"), null, String(raw));
    for (const raw of refused) assert.ok(!dashboardCandidates(FOLDERS, raw, ".html").some((p) => !p.endsWith("/tableau-de-bord/tableau-de-bord.html")), String(raw));
  });

  it("n'insère dans la page que les fichiers de son propre dossier", () => {
    assert.ok(inDashboardFolderOf(PAGE, "~/Livrables/Djénéba/tableau-de-bord/img/logo.png"));
    assert.ok(!inDashboardFolderOf(PAGE, "~/Livrables/Djénéba/_memoire/notes.png"));
    assert.ok(!inDashboardFolderOf(PAGE, "~/Livrables/Mamadou/tableau-de-bord/logo.png"));
    assert.ok(!inDashboardFolderOf("~/Livrables/Djénéba/page.html", "~/Livrables/Djénéba/logo.png"));
  });

  it("ferme tout chargement et tout envoi vers l'extérieur", () => {
    assert.equal(
      FRAME_CSP,
      "sandbox allow-scripts allow-popups; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'self'"
    );
    assert.ok(!FRAME_CSP.includes("allow-same-origin") && !FRAME_CSP.includes("https:"));
  });

  it("la copie gardée change avec la mise à jour de l'expert", () => {
    const paths = dashboardCandidates(FOLDERS, null, ".html");
    assert.notEqual(sharedHtmlKey("inst", paths, "2026-11-06T10:00"), sharedHtmlKey("inst", paths, "2026-11-06T11:00"));
    assert.notEqual(sharedHtmlKey("inst", paths, "x"), sharedHtmlKey("autre", paths, "x"));
    assert.equal(sharedHtmlKey("inst", paths, "x"), sharedHtmlKey("inst", [...paths], "x"));
  });

  it("limite les ouvertures par lien et par adresse", () => {
    const limit = sharedLimits();
    const t = 1_000;
    for (let i = 0; i < 30; i++) assert.equal(limit("frame", "shr_a", "41.1.1.1", t).ok, true);
    assert.equal(limit("frame", "shr_a", "41.1.1.1", t).ok, false);
    assert.equal(limit("page", "shr_a", "41.1.1.1", t).ok, true);
    for (let i = 0; i < 30; i++) assert.equal(limit("frame", "shr_a", `41.2.2.${i}`, t).ok, true);
    assert.equal(limit("frame", "shr_a", "41.3.3.3", t).ok, false);
    assert.equal(limit("frame", "shr_b", "41.3.3.3", t).ok, true);
    assert.equal(limit("frame", "shr_a", "41.3.3.3", t + 61_000).ok, true);
  });

  it("un ancien état (lien Render) reste servi tel quel, jamais quand l'état nomme un fichier", () => {
    assert.equal(legacyLink({ lien: RENDER }), RENDER);
    assert.equal(legacyLink({ lien: RENDER, fichier: "Livrables/Awa/tableau-de-bord/tableau-de-bord.html" }), null);
    assert.equal(legacyLink({ lien: "https://evil.example/share/frame/x" }), null);
    assert.equal(namesFile({ fichier: "  " }), false);
  });
});
