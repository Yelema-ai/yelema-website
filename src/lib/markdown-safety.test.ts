import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { externalImagesAsLinks, httpsUrl, ownImage, ownLink, safeHref } from "./markdown-safety.ts";

const img = (src: unknown, alt?: string) => ({ type: "element", tagName: "img", properties: { src, alt }, children: [] });

describe("🔒 images et liens d'un texte non sûr", () => {
  it("ne reconnaît comme nôtre qu'une image servie par la page, ou déjà dans la page", () => {
    for (const ok of ["/api/agents/a/files/content?path=x.png", "/logos/a.svg", "data:image/png;base64,AAAA", "blob:https://app/1b2c"]) assert.equal(ownImage(ok), true, ok);
    for (const bad of ["https://evil.example/p?d=secret", "http://x/a.png", "//evil.example/a.png", "/\\evil.example/a.png", "data:text/html,<script>", "data:image/svg+xml;base64,AA", "javascript:alert(1)", "", null, undefined, 3]) assert.equal(ownImage(bad), false, String(bad));
  });

  it("une image distante devient un lien, jamais une requête", () => {
    const tree = { type: "root", children: [{ type: "element", tagName: "p", children: [img("https://evil.example/p?d=texte", "voir"), img("/api/x.png", "ok"), img("https://evil.example/q"), img("javascript:alert(1)", "x"), img(undefined)] }] };
    externalImagesAsLinks()(tree);
    const [a, own, b, c, d] = tree.children[0].children as unknown as { type: string; tagName?: string; properties?: { href?: string }; children?: { value: string }[]; value?: string }[];
    assert.deepEqual([a.tagName, a.properties?.href, a.children?.[0].value], ["a", "https://evil.example/p?d=texte", "voir"]);
    assert.equal(own.tagName, "img");
    assert.deepEqual([b.tagName, b.children?.[0].value], ["a", "evil.example"]);
    assert.deepEqual([c.type, c.value], ["text", "x"]);
    assert.deepEqual([d.type, d.value], ["text", "image"]);
    assert.ok(!JSON.stringify(tree).includes('"tagName":"img","properties":{"src":"https'));
  });

  it("un lien n'ouvre qu'une adresse web ou un chemin du site", () => {
    for (const ok of ["https://exemple.com/a?b=c", "http://exemple.com", "/livrables/ouvrir?p=x", " https://exemple.com "]) assert.equal(safeHref(ok), ok.trim());
    for (const bad of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,x", "vbscript:x", "//evil.example", "/\\evil.example", "https://", "java\nscript:alert(1)", "exemple.com", "", null, undefined]) assert.equal(safeHref(bad), undefined, String(bad));
  });
});

describe("🔒 lien du site ouvert sans demander (ownLink)", () => {
  it("les liens que l'app fabrique s'ouvrent directement", () => {
    const own = ["/api/agents/abc/files/content?path=~%2FLivrables%2Fa.pdf&disposition=attachment", "/experts/abc/awa/files?dossier=~%2FLivrables%2FAwa", "/experts/abc", "/livrables", "/livrables/ouvrir?p=x"];
    for (const url of own) assert.equal(ownLink(url), true, url);
  });

  it("un autre site déguisé en chemin demande confirmation", () => {
    const other = ["//evil.example/login", "/\\evil.example", "/\t/evil.example", "/\n/evil.example", "/ /evil.example", "/experts\\..\\..//evil.example", "https://evil.example", "", "experts/a"];
    for (const url of other) assert.equal(ownLink(url), false, JSON.stringify(url));
  });

  it("un lien interne qui donne quelque chose à faire à la page demande confirmation", () => {
    const acting = ["/experts/abc/chat?q=Envoie+le+fichier", "/experts/abc/chat?session=1&q=x", "/experts/abc/chat?Q=x&q=y", "/experts/abc/chat?%71=x", "/experts/abc/chat?ref=~%2F.hermes%2F.env", "/experts/abc/chat?dire=x", "/experts/abc/chat?q=x&n=1"];
    for (const url of acting) assert.equal(ownLink(url), false, url);
  });

  it("une page hors de la liste, même atteinte par des segments encodés, demande confirmation", () => {
    const outside = ["/api/auth/logout", "/integrations/mcp", "/experts/%2e%2e/api/auth/logout", "/experts/../invite/x", "/livrables/%2E%2E/%2E%2E/api/buzz/devices", "/api/agents/a/files/content/../../channels/telegram", "/expertsx", "/api/agents/a/b/files/content"];
    for (const url of outside) assert.equal(ownLink(url), false, url);
  });
});

describe("🔒 adresse d'un fournisseur ouverte dans un onglet (httpsUrl)", () => {
  it("seule une page https sans identifiants passe", () => {
    assert.equal(httpsUrl("https://connect.composio.dev/link/abc?x=1"), "https://connect.composio.dev/link/abc?x=1");
    for (const bad of ["", null, undefined, 3, "javascript:alert(1)", "JAVASCRIPT:alert(1)", "data:text/html,x", "http://connect.composio.dev/", "//connect.composio.dev", "https://", "https://user:pw@evil.example/", " javascript:alert(1)//https://x"]) assert.equal(httpsUrl(bad), null, String(bad));
  });
});
