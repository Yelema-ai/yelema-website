import assert from "node:assert/strict";
import { test } from "node:test";
import { mayWriteChannels, normalizeAllowlist, prepareChannelWrite, relayUnlinkIsShared } from "./channel-rules.ts";
import type { ChannelField, MessagingPlatform } from "./channels.ts";

const field = (key: string, over: Partial<ChannelField> = {}): ChannelField => ({
  key, required: false, is_set: false, redacted_value: null, description: null, prompt: null, help: null, url: null, is_password: false, advanced: false, ...over,
});
const platform = (id: string, fields: ChannelField[]): MessagingPlatform => ({
  id, name: id, description: null, docs_url: null, enabled: false, configured: false, gateway_running: true, state: null, error_code: null, error_message: null, home_channel: null, env_vars: fields,
});
const slack = (allowSet = false) =>
  platform("slack", [
    field("SLACK_BOT_TOKEN", { required: true, is_password: true }),
    field("SLACK_APP_TOKEN", { required: true, is_password: true }),
    field("SLACK_ALLOWED_USERS", { is_set: allowSet }),
    field("SLACK_ALLOW_ALL_USERS", { advanced: true }),
  ]);

test("an allowlist is normalized: commas, no blanks, no duplicates", () => {
  assert.equal(normalizeAllowlist(" U01ABC2DEF3, ,U01ABC2DEF3;W0XYZ123\nU999AAAA "), "U01ABC2DEF3,W0XYZ123,U999AAAA");
});

test("turning a channel on without anyone allowed is refused", () => {
  const sent = { SLACK_BOT_TOKEN: "xoxb-1", SLACK_APP_TOKEN: "xapp-1" };
  assert.match(prepareChannelWrite(slack(), sent, true).problem ?? "", /au moins une personne autorisée/);
  assert.match(prepareChannelWrite(slack(true), { ...sent, SLACK_ALLOWED_USERS: " , " }, true).problem ?? "", /au moins une personne autorisée/);
  assert.equal(prepareChannelWrite(slack(true), sent, true).problem, null);
});

test("allow-all, the Teams port and Google's HTTP callback are never written", () => {
  const teams = platform("teams", [field("TEAMS_ALLOWED_USERS"), field("TEAMS_PORT"), field("TEAMS_HOST")]);
  const { env } = prepareChannelWrite(teams, { TEAMS_ALLOWED_USERS: "0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b", TEAMS_PORT: "80", TEAMS_HOST: "x" }, true);
  assert.deepEqual(env, { TEAMS_ALLOWED_USERS: "0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b" });
  const out = prepareChannelWrite(slack(), { SLACK_BOT_TOKEN: "a", SLACK_APP_TOKEN: "b", SLACK_ALLOWED_USERS: "U01ABC2DEF3", SLACK_ALLOW_ALL_USERS: "true" }, true);
  assert.equal("SLACK_ALLOW_ALL_USERS" in out.env, false);
  const chat = platform("google_chat", [field("GOOGLE_CHAT_HTTP_EVENTS_URL"), field("GOOGLE_CHAT_ALLOWED_USERS")]);
  assert.deepEqual(prepareChannelWrite(chat, { GOOGLE_CHAT_HTTP_EVENTS_URL: "https://x", GOOGLE_CHAT_ALLOWED_USERS: "awa@acme.ci" }, true).env, { GOOGLE_CHAT_ALLOWED_USERS: "awa@acme.ci" });
});

test("each channel's allowed people have the shape its harness compares", () => {
  const teams = platform("teams", [field("TEAMS_ALLOWED_USERS")]);
  assert.match(prepareChannelWrite(teams, { TEAMS_ALLOWED_USERS: "awa@acme.ci" }, true).problem ?? "", /« awa@acme\.ci » ne convient pas.*8-4-4-4-12/);
  const discord = platform("discord", [field("DISCORD_ALLOWED_USERS")]);
  assert.equal(prepareChannelWrite(discord, { DISCORD_ALLOWED_USERS: "123456789012345678" }, true).problem, null);
  assert.match(prepareChannelWrite(discord, { DISCORD_ALLOWED_USERS: "@awa" }, true).problem ?? "", /ne convient pas/);
  const chat = platform("google_chat", [field("GOOGLE_CHAT_ALLOWED_USERS")]);
  assert.match(prepareChannelWrite(chat, { GOOGLE_CHAT_ALLOWED_USERS: "U01ABC2DEF3" }, true).problem ?? "", /adresses e-mail/);
});

test("a missing required credential is named in French; a secret already set is enough", () => {
  assert.match(prepareChannelWrite(slack(true), { SLACK_BOT_TOKEN: "xoxb-1" }, true).problem ?? "", /^À renseigner : SLACK_APP_TOKEN\./);
  const set = platform("slack", [field("SLACK_BOT_TOKEN", { required: true, is_set: true }), field("SLACK_ALLOWED_USERS", { is_set: true })]);
  assert.equal(prepareChannelWrite(set, {}, true).problem, null);
});

test("switching a channel off asks for nothing", () => {
  assert.equal(prepareChannelWrite(slack(), {}, false).problem, null);
});

test("🔒 instance partagée : seul un administrateur écrit ses canaux ; un identifiant d'appariement reste un segment", async () => {
  const { isPairingId, mayWriteChannels } = await import("./channel-rules.ts");
  assert.equal(mayWriteChannels(undefined, "member"), true);
  assert.equal(mayWriteChannels(null, null), true);
  assert.equal(mayWriteChannels("u-abc", "member"), false);
  assert.equal(mayWriteChannels("u-abc", null), false);
  assert.equal(mayWriteChannels("u-abc", "admin"), true);
  for (const ok of ["a1b2c3", "3f2b8c1e-9d4a-4c11-8e7b-1a2b3c4d5e6f", "pair_01:AbC.def"]) assert.equal(isPairingId(ok), true, ok);
  for (const bad of ["", "..", "../x", "a/b", "a..b", "a%2Fb", "a b", "a?b", "-x", "x".repeat(129), 12, null, undefined]) assert.equal(isPairingId(bad), false, String(bad));
});

test("shared instance: the bot and the unlinking of everyone's Slack or Teams are an admin's; one's own Telegram link is not", () => {
  assert.equal(relayUnlinkIsShared("slack"), true);
  assert.equal(relayUnlinkIsShared("teams"), true);
  assert.equal(relayUnlinkIsShared("telegram"), false);
  assert.equal(mayWriteChannels("u-1a2b3c", "member"), false);
  assert.equal(mayWriteChannels("u-1a2b3c", "admin"), true);
  assert.equal(mayWriteChannels(null, "member"), true);
});
