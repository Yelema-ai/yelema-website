import assert from "node:assert/strict";
import { test } from "node:test";
import { inSalon, linkSalonPaths, salonDeliverableFor, salonPathsIn, withoutUrls, type SalonDeliverable } from "./salon-deliverables.ts";

const salon = "4de22c97-59dc-431f-b16a-a10ce12a522b";
const file = "261105_Yelema_fiche-de-poste-Customer-Success-Manager_v1.pdf";
const path = `Livrables/Adjoua/Salons/${salon}/${file}`;
const signed = (p: string) => `https://bo.test/api/v1/app/deliverables/file?${new URLSearchParams({ i: "inst", p, e: "1", s: "sig" })}`;
const item = (p: string, url: string | null = signed(p)): SalonDeliverable => ({ id: p, expertId: "adjoua", title: p.split("/").pop()!, kind: "pdf", updatedAt: "2026-11-05T10:00:00Z", url, folder: "", auteur: "Adjoua (de Selim)" });
const items = [item(path), item(`Livrables/Awa/Salons/${salon}/autre.docx`)];

test("seul un fichier du dossier de CE salon est un livrable du salon", () => {
  assert.equal(inSalon(path, salon), true);
  assert.equal(inSalon(`~/Livrables/Adjoua/Salons/${salon}/sous/${file}`, salon), true);
  assert.equal(inSalon(`Livrables/Adjoua/Salons/autre-salon/${file}`, salon), false);
  assert.equal(inSalon(`Livrables/Adjoua/Reunions/${file}`, salon), false);
  assert.equal(inSalon(`Livrables/Adjoua/Salons/${salon}/../../secret.pdf`, salon), false);
});

test("un chemin cité trouve l'entrée de la liste par son chemin normalisé ; absent, rien n'est deviné", () => {
  assert.equal(salonDeliverableFor(path, salon, items)?.id, path);
  assert.equal(salonDeliverableFor(`/home/node/${path}`, salon, items)?.id, path);
  assert.equal(salonDeliverableFor(`Livrables/Mamadou/Salons/${salon}/${file}`, salon, items), null, "même nom, autre Expert");
  assert.equal(salonDeliverableFor(path, salon, [item(path, null)]), null);
  assert.deepEqual(salonPathsIn(`Voici ${path} et Livrables/Adjoua/Notes/x.md`, salon), [`~/${path}`]);
});

test("le message garde son texte ; seul le chemin trouvé devient un lien, jamais une adresse signée sur l'appareil", () => {
  const { text, links } = linkSalonPaths(`Fiche prête : ${path}\n\nEt \`Livrables/Mamadou/Salons/${salon}/x.pdf\`.`, salon, items);
  assert.equal(text, `Fiche prête : [${file.replace(/_/g, "\\_")}](${signed(path)})\n\nEt \`Livrables/Mamadou/Salons/${salon}/x.pdf\`.`);
  assert.deepEqual([...links], [[file, signed(path)]]);
  assert.ok(withoutUrls(items).every((d) => d.url === null));
});
