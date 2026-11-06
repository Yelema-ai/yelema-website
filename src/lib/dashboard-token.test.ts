import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { openShare, sealShare, shareKey } from "./dashboard-token.ts";

const KEY = shareKey({ DASHBOARD_SHARE_SECRET: "une-cle-de-test-assez-longue" });
const OTHER = shareKey({ DASHBOARD_SHARE_SECRET: "une-autre-cle-de-test-longue" });
const CLAIMS = { w: "ws-a", s: "shr_4f1c9a0e2b7d4c6f8a1e3b5d7c9f0a2b", n: "Q2h4cVd0Z3pMbW5Yb1ZhUjM" };

describe("jeton de partage d'un tableau", () => {
  it("s'ouvre avec la même clé et ne laisse lire ni le partage ni son numéro", () => {
    const token = sealShare(CLAIMS, KEY)!;
    assert.deepEqual(openShare(token, KEY), CLAIMS);
    const plain = Buffer.from(token, "base64url").toString("latin1");
    assert.ok(!plain.includes("shr_") && !plain.includes(CLAIMS.n));
  });

  it("refuse une autre clé, un jeton altéré, tronqué ou étranger", () => {
    const token = sealShare(CLAIMS, KEY)!;
    assert.equal(openShare(token, OTHER), null);
    const flipped = token.slice(0, 15) + (token[15] === "A" ? "B" : "A") + token.slice(16);
    assert.equal(openShare(flipped, KEY), null);
    assert.equal(openShare(token.slice(0, 20), KEY), null);
    assert.equal(openShare("agentId=7p5qy2effr", KEY), null);
    assert.equal(openShare("x".repeat(600), KEY), null);
  });

  it("ne garde que le client, le partage et son numéro : ni instance ni profil dans le lien", () => {
    const token = sealShare({ ...CLAIMS, agentId: "7p5qy2effr", profile: "fatima" } as typeof CLAIMS, KEY)!;
    assert.deepEqual(openShare(token, KEY), CLAIMS);
    assert.ok(!/7p5qy2effr|fatima/.test(Buffer.from(token, "base64url").toString("latin1")));
  });

  it("sans clé, le partage est coupé", () => {
    assert.equal(shareKey({}), null);
    assert.equal(sealShare(CLAIMS, null), null);
    assert.equal(openShare(sealShare(CLAIMS, KEY), null), null);
  });

  it("n'emprunte jamais le secret du resolver", () => {
    assert.equal(shareKey({ APP_RESOLVER_TOKEN: "secret-du-resolver-0123456789" }), null);
    assert.equal(shareKey({ DASHBOARD_SHARE_SECRET: "trop-court" }), null);
  });
});
