import assert from "node:assert/strict";
import { test } from "node:test";

import { authorizationTarget, registrableDomain } from "./oauth-host.ts";

test("an authorization page on the server's own domain is expected, wherever it sits under it", () => {
  assert.deepEqual(authorizationTarget("https://mcp.linear.app/authorize?x=1", "https://mcp.linear.app/mcp"), { url: "https://mcp.linear.app/authorize?x=1", host: "mcp.linear.app", expected: true });
  assert.equal(authorizationTarget("https://auth.atlassian.com/authorize", "https://mcp.atlassian.com/v2/mcp")?.expected, true);
  // GitHub's server lives on another domain than its sign-in: the directory names it.
  assert.equal(authorizationTarget("https://github.com/login/oauth/authorize", "https://api.githubcopilot.com/mcp/")?.expected, false);
  assert.equal(authorizationTarget("https://github.com/login/oauth/authorize", "https://api.githubcopilot.com/mcp/", ["github.com"])?.expected, true);
});

test("an instance that sends the member elsewhere is not followed: the host is shown first", () => {
  const server = "https://mcp.linear.app/mcp";
  for (const url of [
    "https://linear-app.evil.example/authorize",
    "https://mcp.linear.app.evil.example/authorize",
    "https://evil.example/mcp.linear.app",
    "https://linear.app.evil.example/?next=https://linear.app",
    "https://xn--linar-dsa.app/authorize",
  ]) {
    const t = authorizationTarget(url, server, ["linear.app"]);
    assert.equal(t?.expected, false, url);
    assert.ok(t!.host.length > 0);
  }
  // The host shown is the one the browser will open, not what the address pretends before an @.
  assert.equal(authorizationTarget("https://linear.app@evil.example/authorize", server), null);
  assert.equal(authorizationTarget("https://linear.app%2F@evil.example/", server), null);
});

test("never opened: anything but https", () => {
  for (const url of ["http://mcp.linear.app/authorize", "javascript:alert(1)", "data:text/html,x", "//evil.example", "", "ftp://linear.app/"]) {
    assert.equal(authorizationTarget(url, "https://mcp.linear.app/mcp"), null, url);
  }
});

test("two sites under a suffix anyone registers in do not vouch for each other", () => {
  assert.equal(registrableDomain("a.b.linear.app"), "linear.app");
  assert.equal(registrableDomain("mon-mcp.vercel.app"), "mon-mcp.vercel.app");
  assert.equal(registrableDomain("x.banque.co.uk"), "banque.co.uk");
  assert.equal(authorizationTarget("https://voleur.vercel.app/authorize", "https://mon-mcp.vercel.app/mcp")?.expected, false);
  assert.equal(authorizationTarget("https://mon-mcp.vercel.app/authorize", "https://mon-mcp.vercel.app/mcp")?.expected, true);
  assert.equal(authorizationTarget("https://voleur.co.uk/authorize", "https://mcp.banque.co.uk/mcp")?.expected, false);
  // No server address known (older back office): nothing is expected, the member confirms.
  assert.equal(authorizationTarget("https://mcp.linear.app/authorize", null)?.expected, false);
});
