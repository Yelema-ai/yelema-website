import assert from "node:assert/strict";
import { test } from "node:test";
import { catalogueCycle, expertRank } from "./expert-cycle.ts";

const BO = (label: string) => ({ key: label.toLowerCase(), label });
const ex = (profileId: string, label: string | null) => ({ profileId, catalogueKey: null, cycle: label ? BO(label) : null });

test("the catalogue's cycle wins over the back office's label, Djénéba has none", () => {
  assert.deepEqual(catalogueCycle({ profileId: "unifood__ibrahim" }, BO("Légal")), { key: "investissement", label: "Investissement" });
  assert.deepEqual(catalogueCycle({ profileId: "unifood__awa" }, BO("Ventes & Relation client")), { key: "service-client", label: "Service client" });
  assert.deepEqual(catalogueCycle({ profileId: "unifood__alioune" }, null), { key: "investissement", label: "Investissement" });
  assert.equal(catalogueCycle({ profileId: "unifood__djeneba" }, BO("Direction")), null);
  assert.deepEqual(catalogueCycle({ profileId: "unifood__nadia" }, BO("Opérations & Données")), BO("Opérations & Données"));
});

test("Djénéba first, then the catalogue's cycles and places", () => {
  const ids = ["alioune", "koffi", "djeneba", "fatima", "awa", "kouassi", "salif", "adjoua", "fatou", "mamadou", "ibrahim"];
  const sorted = ids.map((n) => ex(`unifood__${n}`, null)).sort((a, b) => expertRank(a) - expertRank(b));
  assert.deepEqual(
    sorted.map((e) => e.profileId.split("__")[1]),
    ["djeneba", "kouassi", "fatima", "koffi", "fatou", "adjoua", "mamadou", "awa", "salif", "alioune", "ibrahim"]
  );
});
