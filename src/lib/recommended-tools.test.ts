import { test } from "node:test";
import assert from "node:assert/strict";
import { forWhom, recommendTools } from "./recommended-tools.ts";
import type { ExpertTool } from "./expert-tools.ts";

const app = (nom: string, composio: string | null, priorite: "essentiel" | "utile" = "utile"): ExpertTool => ({ nom, usage: "", type: "application", composio, priorite });

test("conseillés : essentiels d'abord, déjà branchés retirés, Experts réunis", () => {
  const out = recommendTools(
    [
      { expert: "Djénéba", tools: [app("Gmail", "gmail", "essentiel"), app("Notion", "notion"), app("Google Agenda", "googlecalendar", "essentiel")] },
      { expert: "Kouassi", tools: [app("Gmail", "gmail"), app("HubSpot", "hubspot", "essentiel"), app("Outil maison", null, "essentiel")] },
    ],
    new Set(["googlecalendar"])
  );
  assert.deepEqual(out.map((t) => t.slug), ["gmail", "hubspot", "notion"]);
  assert.deepEqual(out[0].experts, ["Djénéba", "Kouassi"]);
});

test("conseillés : six au plus, ni MCP ni socle", () => {
  const tools = ["a", "b", "c", "d", "e", "f", "g"].map((s) => app(s, s));
  const out = recommendTools([{ expert: "X", tools: [...tools, { nom: "Serveur", usage: "", type: "mcp", composio: "srv", priorite: "essentiel" }] }], new Set());
  assert.equal(out.length, 6);
  assert.ok(!out.some((t) => t.slug === "srv"));
});

test("pour qui", () => {
  assert.equal(forWhom(["Djénéba"]), "Pour Djénéba");
  assert.equal(forWhom(["Djénéba", "Kouassi"]), "Pour Djénéba et Kouassi");
  assert.equal(forWhom(["A", "B", "C"]), "Pour A, B et C");
  assert.equal(forWhom(["A", "B", "C", "D"]), "Pour A, B et 2 autres");
});
