import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { signatureMatches, parseWebhookEvent } from "./webhook.ts";
import { botName, createBotBody, parseBotDetail, parseCreatedBot, parseParticipants, parseTranscript } from "./wire.ts";

test("création : audio seul, transcription MeetStream, conservation bornée, attributs gardés", () => {
  const body = createBotBody({
    link: "https://meet.google.com/mjw-tdio-qvv",
    name: "Djénéba <IA>",
    imageUrl: "https://cdn.example/djeneba.png",
    message: "Bonjour",
    attributes: { agent: "a1", profile: "c__djeneba", meeting: "261118-152927" },
  });
  assert.equal(body.bot_name, "Djénéba IA");
  assert.equal(body.audio_required, true);
  assert.equal(body.video_required, false);
  assert.equal(body.bot_image_url, "https://cdn.example/djeneba.png");
  assert.deepEqual(body.custom_attributes, { agent: "a1", profile: "c__djeneba", meeting: "261118-152927" });
  assert.deepEqual(body.recording_config, { transcript: { provider: { meetstream: { language: "auto" } } }, retention: { type: "timed", hours: 24 } });
  assert.equal("callback_url" in body, false);
  assert.equal("bot_image_url" in createBotBody({ link: "x", name: "D", imageUrl: null, message: "m", attributes: {} }), false);
  assert.equal("join_at" in body, false);
  assert.equal(createBotBody({ link: "x", name: "D", imageUrl: null, message: "m", attributes: {}, joinAt: "2026-11-21T09:00:00.000Z" }).join_at, "2026-11-21T09:00:00.000Z");
});

test("nom du bot : caractères refusés par Teams retirés", () => {
  assert.equal(botName("  Djénéba   (Chief of Staff) !"), "Djénéba Chief of Staff");
  assert.equal(botName("O'Neil_bot.@x-y"), "O'Neil_bot.@x-y");
});

test("réponse de création et détail du bot", () => {
  assert.equal(parseCreatedBot({ bot_id: "08105834-6fca-4488-9c2c-bbf87ec0183f", status: "Active" }), "08105834-6fca-4488-9c2c-bbf87ec0183f");
  assert.equal(parseCreatedBot({}), null);
  const detail = parseBotDetail({
    bot_details: {
      Status: "Done",
      custom_attributes: { agent: "a1", n: 3 },
      StatusTimeline: {
        Joining: { status: true, timestamp: 1795015768 },
        InMeeting: { status: true, timestamp: 1795015841 },
        Leaving: { status: true, timestamp: 1795016485 },
        Stopped: { status: true, timestamp: 1795016485 },
        BotRejected: { status: false, timestamp: null },
      },
    },
  });
  assert.deepEqual(detail, { status: "Done", joinedAt: 1795015841000, endedAt: 1795016485000, attributes: { agent: "a1" } });
  assert.equal(parseBotDetail({ bot_details: { StatusTimeline: {} } }), null);
  assert.equal(parseBotDetail(null), null);
});

test("transcription : format par participant (V2) et format formaté", () => {
  const v2 = parseTranscript([
    {
      participant: { id: 100, name: "Christelle Ebou Nebie" },
      words: [
        { text: "Bonjour", start_timestamp: { relative: 12.5 } },
        { text: "à tous.", start_timestamp: { relative: 13 } },
      ],
    },
    { participant: { id: 200 }, words: [{ text: "Merci" }] },
    { participant: { id: 300, name: "X" }, words: [] },
  ]);
  assert.deepEqual(v2, [
    { speaker: "Christelle Ebou Nebie", text: "Bonjour à tous.", start: 12.5 },
    { speaker: "Participant", text: "Merci", start: null },
  ]);
  assert.deepEqual(parseTranscript({ transcript: [{ speaker: 0, transcript: "Salut", start_time: 1.2 }] }), [{ speaker: "Intervenant 1", text: "Salut", start: 1.2 }]);
  assert.equal(parseTranscript("x"), null);
});

test("participants : nom complet, sans doublon", () => {
  assert.deepEqual(
    parseParticipants([
      { displayName: "Christelle", fullName: "Christelle Ebou Nebie" },
      { displayName: "Christelle", fullName: "Christelle Ebou Nebie" },
      { displayName: "Moussa" },
      { email: "x@y.z" },
    ]),
    ["Christelle Ebou Nebie", "Moussa"]
  );
  assert.deepEqual(parseParticipants({ message: "not found" }), []);
});

test("webhook : signature HMAC-SHA256 du corps brut, en temps constant", () => {
  const body = '{"bot_event":"bot.done","bot_id":"b"}';
  const good = `sha256=${createHmac("sha256", "secret").update(body).digest("hex")}`;
  assert.equal(signatureMatches(body, good, "secret"), true);
  assert.equal(signatureMatches(body, good.toUpperCase().replace("SHA256=", "sha256="), "secret"), true);
  assert.equal(signatureMatches(`${body} `, good, "secret"), false);
  assert.equal(signatureMatches(body, good, "autre"), false);
  assert.equal(signatureMatches(body, good.slice(7), "secret"), false);
  assert.equal(signatureMatches(body, null, "secret"), false);
  assert.equal(signatureMatches(body, good, ""), false);
});

test("webhook : événement, bot et attributs lus", () => {
  assert.deepEqual(parseWebhookEvent('{"event":"bot.stopped","bot_event":"bot.kicked","bot_id":"b1","custom_attributes":{"agent":"a1","x":1}}'), {
    event: "bot.kicked",
    botId: "b1",
    attributes: { agent: "a1" },
  });
  assert.equal(parseWebhookEvent('{"bot_event":"bot.done"}'), null);
  assert.equal(parseWebhookEvent("["), null);
});
