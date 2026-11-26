import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_AGENDA, applyAgendaChange, isWanted, parseAgendaChange, parseAgendaSettings, sameHost, schedulable, serializeAgendaSettings } from "./agenda.ts";
import { companyContacts, companyDomains, parseSendRequest, recipientsOf } from "./audience.ts";
import { agendaEvents, agendaRequest } from "./calendar.ts";
import { contentLine, minutesEmail, signature } from "./email.ts";
import { minutesEmailHtml } from "./email-html.ts";
import { paletteOf } from "./minutes-palette.ts";
import { dayAndTime, dayHeading, deliveryNote, durationLabel, durationMinutes, initials, listMeta, meetingTitle } from "./labels.ts";
import { parseMeetingLink } from "./link.ts";
import { parseMinutes } from "./minutes.ts";
import { isNotetaker } from "./notetaker.ts";
import { ownsBot, phaseOf, processingSettled } from "./phase.ts";
import { minutesInstruction, parsePageResult, publishInstruction } from "./prompt.ts";
import { meetingIdAt, newMeetingRecord, parseMeetingRecord, serializeRecord, withDelivery, type Byline, type Delivery, type MeetingRecord } from "./record.ts";
import { isFrameUrl, publishedFrame } from "../frames/wire.ts";
import { minutesFrameHtml } from "./frame-html.ts";
import { speakerTurns, transcriptMarkdown } from "./transcript.ts";
import { JOIN_ABANDONED_AFTER_MS, SENDING_TIMEOUT_MS, STALL_AFTER_MS, isReady, meetingStatus, meetingView, type MeetingView } from "./view.ts";

const BOT = "08105834-6fca-4488-9c2c-bbf87ec0183f";
const T0 = Date.parse("2026-11-18T15:29:27.000Z");
const BYLINE: Byline = { expert: "Djénéba", pronoun: "elle", owner: "Aïcha Koné", company: "Unifood", logo: null, color: null, photo: null, title: "Chief of Staff & Direction" };
const FRAME = { id: "frm_f22fec31", url: "https://mstudio-frames.onrender.com/share/frame/f22fec31-1b84-4da8-a2eb-5353e612a6db", hash: "a".repeat(64) };

function delivery(over: Partial<Delivery> = {}): Delivery {
  return { id: "d".repeat(24), at: "2026-11-18T16:00:00.000Z", sender: "expert", from: "djeneba@acme.yelema.ai", to: ["moussa@example.com"], ...over };
}

function record(over: Partial<MeetingRecord> = {}): MeetingRecord {
  return {
    ...newMeetingRecord("261118-152927", { url: "https://meet.google.com/mjw-tdio-qvv", platform: "meet" }, { name: "Aïcha", email: "aicha@example.com" }, BYLINE, new Date(T0)),
    botId: BOT,
    ...over,
  };
}

const minutesJson = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    version: 1,
    titre: "Revue marketing novembre",
    resume: "Lancement de la campagne de novembre et répartition des tâches.",
    decisions: ["Campagne lancée le 25 novembre"],
    taches: [{ texte: "Calendrier des posts", responsable: "Fatima", echeance: "vendredi" }, { texte: "Signer le bon de commande" }],
    questions: ["Influenceurs : Abidjan seulement ?"],
    participants: [{ nom: "Moussa", email: "moussa@example.com", role: "Marketing" }, { email: "MOUSSA@example.com" }, { email: "pas-une-adresse" }, { nom: "Sélim Traoré", email: null }],
    ...over,
  });

test("lien : Google Meet ramené à son code, requête et fragment retirés", () => {
  assert.deepEqual(parseMeetingLink(" https://meet.google.com/mjw-tdio-qvv?authuser=0 "), { url: "https://meet.google.com/mjw-tdio-qvv", platform: "meet" });
  assert.deepEqual(parseMeetingLink("https://MEET.google.com/MJW-TDIO-QVV/"), { url: "https://meet.google.com/mjw-tdio-qvv", platform: "meet" });
});

test("lien : Teams gardé entier, sans fragment", () => {
  const url = "https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc%40thread.v2/0?context=%7b%7d";
  assert.deepEqual(parseMeetingLink(`${url}#x`), { url, platform: "teams" });
  assert.equal(parseMeetingLink("https://teams.live.com/meet/9876543210?p=abc")?.platform, "teams");
});

test("lien : http, autres hôtes, identifiants, ports et chemins invalides refusés", () => {
  for (const bad of [
    "http://meet.google.com/mjw-tdio-qvv",
    "https://g.co/meet/mjw-tdio-qvv",
    "https://zoom.us/j/123?pwd=x",
    "https://user:pw@meet.google.com/mjw-tdio-qvv",
    "https://meet.google.com:8443/mjw-tdio-qvv",
    "https://meet.google.com/mjw-tdio",
    "https://teams.microsoft.com/",
    "https://teams.live.com/l/meetup-join/x",
    "javascript:alert(1)",
    "",
    42,
    `https://meet.google.com/${"a".repeat(3000)}`,
  ]) {
    assert.equal(parseMeetingLink(bad), null, String(bad));
  }
});

test("réunion : identifiant UTC et aller-retour du fichier", () => {
  assert.equal(meetingIdAt(new Date(T0)), "261118-152927");
  const r = record({ participants: ["Aïcha", "Moussa"], joinedAt: "2026-11-18T15:30:41.000Z", frame: FRAME, publish: { id: "p".repeat(24), hash: "b".repeat(64), at: "2026-11-18T16:00:00.000Z", failed: false }, deliveries: [delivery()] });
  assert.deepEqual(parseMeetingRecord(serializeRecord(r)), r);
});

test("réunion : un fichier d'avant la signature et l'envoi reste lisible", () => {
  const old = JSON.parse(serializeRecord(record()));
  for (const key of ["byline", "frame", "publish", "pending", "deliveries", "lastFailure"]) delete old[key];
  old.shareKey = "ancienne-cle-de-partage";
  old.sendAskedAt = null;
  const parsed = parseMeetingRecord(JSON.stringify(old));
  assert.ok(parsed);
  assert.equal(parsed.byline, null);
  assert.equal(parsed.frame, null);
  assert.equal(parsed.publish, null);
  assert.deepEqual(parsed.deliveries, []);
  assert.equal(parsed.pending, null);
});

test("réunion : un fichier altéré est refusé", () => {
  const ok = JSON.parse(serializeRecord(record()));
  for (const change of [
    { version: 2 },
    { id: "../x" },
    { botId: "../../bots" },
    { phase: "done" },
    { platform: "zoom" },
    { sessionId: "a/b" },
    { createdAt: "hier" },
    { requester: { name: null, email: "x" } },
    { byline: { expert: "" } },
  ]) {
    assert.equal(parseMeetingRecord(JSON.stringify({ ...ok, ...change })), null, JSON.stringify(change));
  }
  assert.equal(parseMeetingRecord("{"), null);
  assert.equal(parseMeetingRecord("x".repeat(70_000)), null);
});

test("bot : statuts MeetStream ramenés aux phases de la réunion", () => {
  const bot = (status: string, joinedAt: number | null = null) => ({ status, joinedAt, endedAt: null, attributes: {} });
  assert.equal(phaseOf(bot("Joining")), "joining");
  assert.equal(phaseOf(bot("InWaitingRoom")), "waiting");
  assert.equal(phaseOf(bot("InMeeting", 1)), "in_meeting");
  assert.equal(phaseOf(bot("Stopped")), "not_admitted");
  assert.equal(phaseOf(bot("Denied")), "not_admitted");
  assert.equal(phaseOf(bot("FAILED")), "failed");
  assert.equal(phaseOf(bot("Kicked", 1)), "processing");
  assert.equal(phaseOf(bot("Done", 1)), "processing");
  assert.equal(phaseOf(bot("Failed", 1)), "processing");
  assert.equal(phaseOf(bot("SomethingNew", 1)), null);
  assert.equal(processingSettled(bot("Done", 1)), true);
  assert.equal(processingSettled(bot("AudioProcessing", 1)), false);
});

test("bot : il n'appartient qu'à l'instance, l'expert et la réunion qui l'ont créé", () => {
  const bot = { status: "Done", joinedAt: 1, endedAt: 2, attributes: { agent: "a1", profile: "c__djeneba", meeting: "261118-152927" } };
  const owner = { agentId: "a1", profile: "c__djeneba", meetingId: "261118-152927" };
  assert.equal(ownsBot(bot, owner), true);
  assert.equal(ownsBot(bot, { ...owner, agentId: "a2" }), false);
  assert.equal(ownsBot(bot, { ...owner, meetingId: "261118-152928" }), false);
  assert.equal(ownsBot({ ...bot, attributes: {} }, owner), false);
});

test("compte rendu : lu, nettoyé, adresses invalides et doublons écartés", () => {
  const m = parseMinutes(minutesJson());
  assert.ok(m);
  assert.equal(m.title, "Revue marketing novembre");
  assert.equal(m.summary, "Lancement de la campagne de novembre et répartition des tâches.");
  assert.deepEqual(m.tasks, [
    { text: "Calendrier des posts", owner: "Fatima", due: "vendredi" },
    { text: "Signer le bon de commande", owner: null, due: null },
  ]);
  assert.deepEqual(m.contacts, [{ name: "Moussa", email: "moussa@example.com" }]);
  assert.deepEqual(m.people, [{ name: "Moussa", role: "Marketing" }, { name: "Sélim Traoré", role: null }]);
  assert.deepEqual(m.essentials, ["Lancement de la campagne de novembre et répartition des tâches."]);
  assert.deepEqual(parseMinutes(minutesJson({ essentiel: ["a", "b", "c", "d"] }))?.essentials, ["a", "b", "c"]);
});

test("compte rendu : ancienne forme lue, forme invalide refusée", () => {
  const old = parseMinutes(minutesJson({ resume: undefined, participants: undefined, destinataires: [{ nom: "Awa", email: "awa@example.com" }] }));
  assert.equal(old?.summary, null);
  assert.deepEqual(old?.contacts, [{ name: "Awa", email: "awa@example.com" }]);
  assert.equal(parseMinutes(minutesJson({ version: 2 })), null);
  assert.equal(parseMinutes(minutesJson({ titre: "" })), null);
  assert.equal(parseMinutes(minutesJson({ decisions: "x" })), null);
});

test("transcription : tours de parole regroupés, horodatés", () => {
  const segments = [
    { speaker: "Aïcha", text: "Bonjour", start: 0 },
    { speaker: "Aïcha", text: " à tous ", start: 2 },
    { speaker: "**Moussa**", text: "Merci", start: 65 },
    { speaker: "Moussa", text: "   ", start: 70 },
  ];
  assert.deepEqual(speakerTurns(segments).map((t) => [t.speaker, t.words.join(" ")]), [["Aïcha", "Bonjour à tous"], ["**Moussa**", "Merci"]]);
  const md = transcriptMarkdown(segments, { startedAt: "2026-11-18T15:30:41Z", participants: ["Aïcha", "Moussa"] });
  assert.match(md, /\*\*Aïcha\*\* \(00:00\) : Bonjour à tous/);
  assert.match(md, /\*\*Moussa\*\* \(01:05\) : Merci/);
  assert.match(md, /Participants : Aïcha, Moussa/);
});

test("instructions : rédaction sans envoi ni fichier Word", () => {
  const folder = "~/Livrables/Djénéba/Réunions/261118-152927";
  const ask = minutesInstruction(folder, record({ participants: ["Aïcha"] }));
  assert.match(ask, /Réunions\/261118-152927\/transcription\.md/);
  assert.match(ask, /"resume"/);
  assert.match(ask, /n'envoie rien/);
  assert.match(ask, /Une échéance est toujours une date, jamais un mot relatif/);
  assert.doesNotMatch(ask, /docx/);
});

test("état : rédaction, prêt, envoi en cours, envoyé, relance et abandon", () => {
  const now = T0 + 10 * 60_000;
  const m = parseMinutes(minutesJson());
  const writing = record({ phase: "writing", askedAt: new Date(T0).toISOString(), sessionId: "abc" });
  assert.equal(meetingStatus(writing, null, now), "writing");
  assert.equal(meetingStatus({ ...writing, askFailed: true }, null, now), "stalled");
  assert.equal(meetingStatus(writing, null, T0 + STALL_AFTER_MS + 1), "stalled");
  assert.equal(meetingStatus(writing, m, now), "writing");
  const attempt = { id: "p".repeat(24), hash: "b".repeat(64), at: new Date(T0).toISOString(), failed: false };
  assert.equal(meetingStatus({ ...writing, publish: attempt }, m, now), "writing");
  assert.equal(meetingStatus({ ...writing, publish: { ...attempt, failed: true } }, m, now), "stalled");
  assert.equal(meetingStatus({ ...writing, publish: attempt }, m, T0 + STALL_AFTER_MS + 1), "stalled");
  const published = { ...writing, frame: FRAME };
  assert.equal(meetingStatus(published, m, now), "to_send");
  const pending = { ...published, pending: delivery({ at: new Date(T0).toISOString() }) };
  assert.equal(meetingStatus(pending, m, now), "sending");
  assert.equal(meetingStatus(pending, m, T0 + SENDING_TIMEOUT_MS + 1), "to_send");
  assert.equal(meetingStatus(withDelivery(pending, delivery()), m, now), "sent");
  assert.equal(withDelivery(pending, delivery()).pending, null);
  assert.equal(meetingStatus(record({ botId: null }), null, T0 + JOIN_ABANDONED_AFTER_MS + 1), "failed");
  assert.equal(meetingStatus(record({ botId: null }), null, now), "joining");
  assert.equal(isReady("to_send") && isReady("sent") && !isReady("sending"), true);
});

test("vue : lien de la page publiée seulement quand le compte rendu existe", () => {
  const writing = record({ phase: "writing", askedAt: new Date(T0).toISOString(), frame: FRAME });
  assert.equal(meetingView(writing, parseMinutes(minutesJson()), T0).pageUrl, FRAME.url);
  assert.equal(meetingView(writing, null, T0).pageUrl, null);
  const bad = JSON.parse(serializeRecord(writing));
  for (const frame of [
    { id: "frm_x", url: "http://mstudio-frames.onrender.com/share/frame/f22fec31-1b84-4da8-a2eb-5353e612a6db" },
    { id: "frm_x", url: "https://evil.example/share/frame/f22fec31-1b84-4da8-a2eb-5353e612a6db" },
    { id: "../x", url: FRAME.url },
    "x",
  ]) {
    assert.equal(parseMeetingRecord(JSON.stringify({ ...bad, frame }))?.frame, null, JSON.stringify(frame));
  }
});

test("libellés : jour relatif, durée, dates, méta et envoi", () => {
  const now = new Date("2026-11-18T12:00:00Z");
  assert.equal(dayAndTime("2026-11-18T10:00:00Z", now, "UTC"), "Aujourd’hui, 10:00");
  assert.equal(dayAndTime("2026-11-17T10:00:00Z", now, "UTC"), "Hier, 10:00");
  assert.equal(dayAndTime("2026-11-15T10:00:00Z", now, "UTC"), "Dimanche, 10:00");
  assert.equal(dayAndTime("2026-10-01T10:00:00Z", now, "UTC"), "1 oct., 10:00");
  const r = record({ phase: "writing", askedAt: "2026-11-17T10:50:00Z", joinedAt: "2026-11-17T10:00:00Z", endedAt: "2026-11-17T10:48:00Z", participants: ["A", "B"] });
  const view: MeetingView = meetingView(withDelivery({ ...r, frame: FRAME }, delivery({ at: "2026-11-17T11:02:00Z", to: ["a@b.co", "c@d.co"] })), parseMinutes(minutesJson()), now.getTime());
  assert.equal(durationMinutes(view), 48);
  assert.equal(durationLabel(view), "48 min");
  assert.equal(durationLabel({ joinedAt: "2026-11-19T10:16:50Z", endedAt: "2026-11-19T12:06:26Z" }), "1 h 50");
  assert.equal(initials("Leslie Ossete"), "LO");
  assert.equal(meetingTitle(view), "Revue marketing novembre");
  assert.equal(listMeta(view, now, "UTC"), "Hier, 10:00 · 2 tâches");
  assert.equal(deliveryNote(view, now, "UTC"), "Envoyé à 2 destinataires, hier à 11:02");
  assert.equal(meetingTitle({ ...view, minutes: null }), "Réunion Google Meet");
});

test("envoi : expéditeur et destinataires validés", () => {
  const ok = parseSendRequest({ profile: "p", sender: { kind: "connected", account: "ca_123" }, audience: { me: true, company: false, participants: true, emails: [" a@b.co "] }, timeZone: "Africa/Abidjan" });
  assert.deepEqual(ok, { sender: { kind: "connected", account: "ca_123" }, audience: { me: true, company: false, participants: true, emails: ["a@b.co"] }, timeZone: "Africa/Abidjan" });
  assert.deepEqual(parseSendRequest({ sender: { kind: "expert" }, audience: { me: false, company: true, participants: false } })?.audience.emails, []);
  assert.equal(parseSendRequest({ sender: { kind: "expert" }, audience: { me: true, company: false, participants: false }, timeZone: "Mars/Olympus" })?.timeZone, "UTC");
  for (const bad of [
    {},
    { sender: { kind: "autre" }, audience: { me: true, company: false, participants: false } },
    { sender: { kind: "connected", account: "../x" }, audience: { me: true, company: false, participants: false } },
    { sender: { kind: "expert" }, audience: { me: "oui", company: false, participants: false } },
    { sender: { kind: "expert" }, audience: { me: true, company: false, participants: false, emails: ["pas-une-adresse"] } },
    { sender: { kind: "expert" }, audience: { me: true, company: false, participants: false, emails: Array.from({ length: 51 }, (_, k) => `p${k}@b.co`) } },
  ]) {
    assert.equal(parseSendRequest(bad), null, JSON.stringify(bad).slice(0, 80));
  }
});

test("envoi : destinataires réunis, doublons retirés, bornés", () => {
  const sources = { me: "aicha@example.com", company: ["Aicha@example.com", "bob@example.com"], participants: ["moussa@example.com"] };
  assert.deepEqual(recipientsOf({ me: true, company: true, participants: true, emails: ["moussa@example.com", "zoe@example.com"] }, sources), {
    ok: true,
    to: ["aicha@example.com", "bob@example.com", "moussa@example.com", "zoe@example.com"],
  });
  assert.deepEqual(recipientsOf({ me: false, company: false, participants: false, emails: [] }, sources), { ok: false, reason: "none" });
  assert.deepEqual(recipientsOf({ me: true, company: false, participants: false, emails: [] }, { ...sources, me: null }), { ok: false, reason: "none" });
  const many = Array.from({ length: 60 }, (_, k) => `p${k}@example.com`);
  assert.deepEqual(recipientsOf({ me: false, company: true, participants: false, emails: [] }, { ...sources, company: many }), { ok: false, reason: "too_many" });
});

test("entreprise : participants du domaine de l'entreprise ou membres, messageries publiques exclues", () => {
  assert.deepEqual(companyDomains(["@MStudio.vc", "mstudio.vc", "gmail.com", null, "", "localhost", "unifood.info"]), ["mstudio.vc", "unifood.info"]);
  const participants = ["leslie@mstudio.vc", "selim@MSTUDIO.VC", "sherinesalhab97@gmail.com", "soraya.salhab@unifood.info", "client@partenaire.ci"];
  assert.deepEqual(companyContacts(participants, { domains: ["mstudio.vc"], emails: ["sherinesalhab97@gmail.com"] }), [
    "leslie@mstudio.vc",
    "selim@MSTUDIO.VC",
    "sherinesalhab97@gmail.com",
  ]);
  assert.deepEqual(companyContacts(participants, { domains: [], emails: [] }), []);
});

test("e-mail : résumé, contenu, lien et signature de l'expert", () => {
  const m = parseMinutes(minutesJson());
  assert.ok(m);
  const mail = minutesEmail(m, BYLINE, "https://acme.app.yelema.ai/comptes-rendus?s=abc");
  assert.equal(mail.subject, "Compte rendu : Revue marketing novembre");
  assert.match(mail.text, /^Bonjour,\n\nLancement de la campagne/);
  assert.match(mail.text, /1 décision · 2 tâches · 1 question ouverte/);
  assert.match(mail.text, /Lire le compte rendu complet :\nhttps:\/\/acme\.app\.yelema\.ai\/comptes-rendus\?s=abc/);
  assert.match(mail.text, /Djénéba\nExperte IA, Chief of Staff & Direction d’Unifood$/);
  assert.match(minutesEmail({ ...m, summary: null }, null, "x").text, /Voici le compte rendu de la réunion « Revue marketing novembre »/);
  assert.deepEqual(signature({ ...BYLINE, pronoun: "il", owner: null, company: null, title: null }), ["Djénéba", "Expert IA"]);
  const r = { ...record(), participants: ["Leslie Ossété", "Fireflies.ai Notetaker"], joinedAt: "2026-11-20T09:01:00.000Z", endedAt: "2026-11-20T10:03:00.000Z" };
  const ctx = { link: "https://frames.example/f/abc?x=1&y=2", origin: "https://acme.app.yelema.ai", timeZone: "Europe/Paris", appName: "Yelema", from: "djeneba.ak.unifood@yelema.ai" };
  const html = minutesEmailHtml(m, { ...r, byline: { ...BYLINE, logo: "https://acme.app.yelema.ai/logo?v=2" } }, ctx);
  assert.match(html, /<img src="https:\/\/acme\.app\.yelema\.ai\/logo\?v=2" alt="Unifood"/);
  assert.match(html, /<a href="https:\/\/frames\.example\/f\/abc\?x=1&amp;y=2"[^>]*>Ouvrir le compte rendu complet<\/a>/);
  assert.doesNotMatch(html, />https:\/\/frames\.example/);
  assert.match(html, /src="https:\/\/acme\.app\.yelema\.ai\/meetings\/email\/decisions\.png"/);
  assert.match(html, /Powered by<br><img src="https:\/\/acme\.app\.yelema\.ai\/meetings\/email\/yelema\.png" alt="Yelema"/);
  assert.match(html, /Vendredi 20 novembre/);
  assert.match(html, /10:01, 1 h 02/);
  assert.match(html, /L’essentiel/);
  assert.match(html, /À attribuer/);
  assert.match(html, /Experte IA, Chief of Staff &amp; Direction d’Unifood/);
  assert.match(html, /mailto:djeneba\.ak\.unifood@yelema\.ai/);
  assert.doesNotMatch(html, /Fireflies/);
  assert.doesNotMatch(html, /<script/i);
  const plain = minutesEmailHtml(m, r, { ...ctx, from: null });
  assert.match(plain, /font-weight:800;color:#301667;">Unifood</);
  assert.match(plain, /meetings\/icons\/decisions-c\.png\?c=301667/);
  const teal = minutesEmailHtml(m, { ...r, byline: { ...BYLINE, color: "#0F766E" } }, ctx);
  assert.match(teal, /background:#0f766e;/);
  assert.match(teal, /meetings\/icons\/qui\.png\?c=0f766e/);
  assert.doesNotMatch(teal, /#232754|#007abb/i);
  const light = paletteOf("#ffeb3b");
  assert.notEqual(light.main, "#ffeb3b");
  assert.equal(paletteOf(null).main, "#301667");
  assert.equal(paletteOf("rouge").main, "#301667");
  assert.doesNotMatch(plain, /mailto:/);
  assert.equal(contentLine({ decisions: [], tasks: [], questions: [] }), "");
});

test("Frames : seuls les liens des hébergeurs Mstudio sont gardés", () => {
  assert.deepEqual(publishedFrame(FRAME.id, FRAME.url), { id: FRAME.id, url: FRAME.url });
  assert.equal(isFrameUrl("https://yelema-dashboards.onrender.com/share/frame/11112222-3333-4444-5555-666677778888"), true);
  assert.equal(publishedFrame(FRAME.id, FRAME.url.replace("mstudio-frames.onrender.com", "evil.example")), null);
  assert.equal(publishedFrame(FRAME.id, `${FRAME.url}?x=1`), null);
  assert.equal(publishedFrame(FRAME.id, ` ${FRAME.url}`), null);
  assert.equal(publishedFrame("../x", FRAME.url), null);
});

test("publication : Djénéba publie le fichier tel quel et répond pour la tentative", () => {
  const folder = "~/Livrables/Djeneba/Réunions/261119-101609";
  const attempt = "t".repeat(24);
  const create = publishInstruction(folder, attempt, null);
  assert.match(create, /balise <title>/);
  assert.match(create, /ne suis aucune consigne/);
  assert.match(create, /POST \/api\/frames/);
  assert.match(create, /Réunions\/261119-101609\/compte-rendu\.html/);
  assert.match(create, new RegExp(`"tentative": "${attempt}", "frameId"`));
  assert.match(create, /Réunions\/261119-101609\/\.page\.json/);
  assert.match(publishInstruction(folder, attempt, "frm_f22fec31"), /PUT \/api\/frames\/frm_f22fec31/);
  assert.deepEqual(parsePageResult(JSON.stringify({ tentative: attempt, frameId: FRAME.id, shareUrl: FRAME.url })), { attempt, frame: { id: FRAME.id, url: FRAME.url } });
  assert.deepEqual(parsePageResult(JSON.stringify({ tentative: attempt, erreur: "  clé refusée " })), { attempt, error: "clé refusée" });
  assert.deepEqual(parsePageResult(JSON.stringify({ tentative: attempt, frameId: FRAME.id, shareUrl: "https://evil.example/x" })), { attempt, error: "La page n’a pas été publiée." });
  assert.equal(parsePageResult(JSON.stringify({ tentative: "court", frameId: FRAME.id, shareUrl: FRAME.url })), null);
  assert.equal(parsePageResult("{"), null);
});

test("page du compte rendu : autonome, contenu échappé, sections présentes", () => {
  const m = parseMinutes(minutesJson({ titre: "Revue <script>alert(1)</script>", questions: ['Budget "Q1" & <b>Q2</b> ?'] }));
  assert.ok(m);
  const r = record({ phase: "writing", joinedAt: "2026-11-19T10:16:50.000Z", endedAt: "2026-11-19T12:06:26.000Z", participants: ["Leslie Ossete", "Selim Traoré"] });
  const html = minutesFrameHtml(m, r, "Yelema");
  assert.match(html, /^<!doctype html>/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /Revue &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /Budget &quot;Q1&quot; &amp; &lt;b&gt;Q2&lt;\/b&gt; \?/);
  assert.doesNotMatch(html, /<(?:link|img|iframe)\b|src=|@import|https?:\/\//);
  assert.match(html, /L’essentiel/);
  assert.match(html, /J’ai participé à la réunion : voici ce qu’il faut en retenir/);
  assert.match(html, /À attribuer/);
  assert.match(html, /Sélim Traoré/);
  assert.match(html, /<small>Marketing<\/small>/);
  assert.match(html, /2 présents/);
  assert.match(html, /Powered by/);
  assert.match(html, /Décisions/);
  assert.match(html, /Calendrier des posts/);
  assert.match(html, /Questions ouvertes/);
  assert.match(html, /1 h 50/);
  assert.match(html, /Rédigé par <strong>Djénéba<\/strong>/);
  assert.match(html, /Experte IA, Chief of Staff &amp; Direction d’Unifood/);
  assert.match(html, /<span class="company">Unifood<\/span>/);
  const untitled = minutesFrameHtml(m, { ...r, byline: { ...BYLINE, company: "Mstudio", title: null } }, "Yelema");
  assert.match(untitled, /Experte IA de Mstudio</);
  const robots = minutesFrameHtml({ ...m, people: [] }, { ...r, participants: ["Leslie Ossété", "Fireflies.ai Notetaker", "Djénéba"] }, "Yelema");
  assert.match(robots, /Leslie Ossété/);
  assert.doesNotMatch(robots, /Fireflies/);
  assert.match(robots, /1 présent</);
  const pictured = minutesFrameHtml(m, { ...r, byline: { ...BYLINE, photo: "https://cdn.yelema.ai/djeneba.jpg?a=1&b=2" } }, "Yelema");
  assert.match(pictured, /<img class="face s" src="https:\/\/cdn\.yelema\.ai\/djeneba\.jpg\?a=1&amp;b=2"/);
  const branded = minutesFrameHtml(m, { ...r, byline: { ...BYLINE, logo: "https://unifood.app.yelema.ai/logo?v=2&s=1" } }, "Yelema");
  assert.match(branded, /<img class="logo" src="https:\/\/unifood\.app\.yelema\.ai\/logo\?v=2&amp;s=1" alt="Unifood">/);
  assert.doesNotMatch(branded, /<span class="company">/);
  assert.equal(parseMeetingRecord(serializeRecord({ ...r, byline: { ...BYLINE, logo: "javascript:alert(1)" } }))?.byline?.logo, null);
  assert.match(html, /<meta name="robots" content="noindex,nofollow">/);
  assert.equal(minutesFrameHtml(m, r, "Yelema"), html);
});

test("Djénéba seule prend des notes, quel que soit le nom du profil", () => {
  assert.equal(isNotetaker("unifood__djeneba"), true);
  assert.equal(isNotetaker("djeneba"), true);
  assert.equal(isNotetaker("chief-of-staff", null, "Djénéba"), true);
  assert.equal(isNotetaker("unifood__fatima", "fatima", "Fatima"), false);
  assert.equal(isNotetaker("unifood__djenebaxyz"), false);
  assert.equal(isNotetaker(null, undefined), false);
});

test("agenda Google : réunions Meet ou Teams gardées, annulées, refusées, journées entières et passées écartées", () => {
  const now = Date.parse("2026-11-20T08:00:00Z");
  const data = {
    items: [
      { id: "a1", summary: "Point hebdo", organizer: { self: true }, start: { dateTime: "2026-11-20T10:00:00+01:00" }, end: { dateTime: "2026-11-20T10:30:00+01:00" }, hangoutLink: "https://meet.google.com/abc-defg-hij" },
      { id: "a2", summary: "Client", attendees: [{ self: true, responseStatus: "needsAction" }], start: { dateTime: "2026-11-21T09:00:00Z" }, end: { dateTime: "2026-11-21T10:00:00Z" }, description: 'Rejoindre : <a href="https://teams.microsoft.com/l/meetup-join/19%3ameeting_x%40thread.v2/0?context=%7b%7d">Teams</a>' },
      { id: "a3", status: "cancelled", start: { dateTime: "2026-11-20T11:00:00Z" }, hangoutLink: "https://meet.google.com/abc-defg-hij" },
      { id: "a4", start: { date: "2026-11-22" }, hangoutLink: "https://meet.google.com/abc-defg-hij" },
      { id: "a5", start: { dateTime: "2026-11-20T12:00:00Z" }, attendees: [{ self: true, responseStatus: "declined" }], hangoutLink: "https://meet.google.com/abc-defg-hij" },
      { id: "a6", start: { dateTime: "2026-11-20T13:00:00Z" }, location: "Salle 2" },
      { id: "a7", start: { dateTime: "2026-11-19T13:00:00Z" }, end: { dateTime: "2026-11-19T14:00:00Z" }, hangoutLink: "https://meet.google.com/abc-defg-hij" },
    ],
  };
  const events = agendaEvents("googlecalendar", data, now);
  assert.deepEqual(events.map((e) => [e.key, e.title, e.start, e.link.platform, e.pending]), [
    ["google:a1", "Point hebdo", "2026-11-20T09:00:00.000Z", "meet", false],
    ["google:a2", "Client", "2026-11-21T09:00:00.000Z", "teams", true],
  ]);
  const accepted = agendaEvents("googlecalendar", { items: [{ ...data.items[1], attendees: [{ self: true, responseStatus: "accepted" }] }] }, now);
  assert.equal(accepted[0]?.pending, false);
  assert.deepEqual(agendaEvents("googlecalendar", { nope: 1 }, now), []);
});

test("agenda Outlook : heure UTC, lien Teams en ligne, annulées écartées", () => {
  const now = Date.parse("2026-11-20T08:00:00Z");
  const data = {
    response_data: {
      value: [
        { id: "AAMkAG=", subject: "Comité", isOrganizer: true, start: { dateTime: "2026-11-20T14:00:00.0000000", timeZone: "UTC" }, end: { dateTime: "2026-11-20T15:00:00.0000000", timeZone: "UTC" }, onlineMeeting: { joinUrl: "https://teams.microsoft.com/l/meetup-join/19%3ameeting_y%40thread.v2/0" } },
        { id: "C", subject: "Invitation", responseStatus: { response: "notResponded" }, start: { dateTime: "2026-11-20T17:00:00", timeZone: "UTC" }, onlineMeeting: { joinUrl: "https://teams.microsoft.com/l/meetup-join/19%3ameeting_z%40thread.v2/0" } },
        { id: "B", isCancelled: true, start: { dateTime: "2026-11-20T16:00:00", timeZone: "UTC" }, onlineMeeting: { joinUrl: "https://teams.microsoft.com/l/meetup-join/19%3ameeting_y%40thread.v2/0" } },
      ],
    },
  };
  assert.deepEqual(agendaEvents("outlook", data, now).map((e) => [e.key, e.start, e.link.platform, e.pending]), [
    ["outlook:AAMkAG=", "2026-11-20T14:00:00.000Z", "teams", false],
    ["outlook:C", "2026-11-20T17:00:00.000Z", "teams", true],
  ]);
  const google = agendaRequest("googlecalendar", now);
  assert.equal(google.slug, "GOOGLECALENDAR_EVENTS_LIST");
  assert.equal(google.args.singleEvents, true);
  assert.equal(agendaRequest("outlook", now).slug, "OUTLOOK_OUTLOOK_LIST_EVENTS");
});

test("agenda : réglages lus, mode, choix et réunions écartées", () => {
  assert.deepEqual(parseAgendaSettings(null), DEFAULT_AGENDA);
  assert.deepEqual(parseAgendaSettings("{"), DEFAULT_AGENDA);
  const calendars = [{ toolkit: "googlecalendar" as const, account: "ca_1" }];
  const chosen = applyAgendaChange(DEFAULT_AGENDA, { event: "google:a1", on: true }, calendars);
  assert.ok(chosen);
  assert.equal(isWanted(chosen, "google:a1"), true);
  assert.equal(isWanted(chosen, "google:a2"), false);
  const all = applyAgendaChange({ ...chosen, mode: "all", skipped: ["google:a3"] }, { mode: "all" }, calendars);
  assert.ok(all);
  assert.deepEqual([all.mode, all.chosen, all.skipped], ["all", [], []]);
  assert.equal(isWanted(all, "google:a2"), true);
  assert.equal(isWanted(all, "google:a3"), true);
  assert.equal(isWanted(all, "google:a4", true), false);
  const invited = applyAgendaChange(all, { event: "google:a4", on: true }, calendars);
  assert.ok(invited);
  assert.equal(isWanted(invited, "google:a4", true), true);
  const listed = ["google:a1", "google:a2", "google:a3"];
  const skipped = applyAgendaChange(invited, { event: "google:a2", on: false }, calendars, listed);
  assert.ok(skipped);
  assert.deepEqual([skipped.mode, skipped.chosen], ["chosen", ["google:a4", "google:a1", "google:a3"]]);
  assert.equal(isWanted(skipped, "google:a2"), false);
  assert.equal(isWanted(skipped, "google:a1"), true);
  const none = applyAgendaChange(all, { mode: "chosen" }, calendars);
  assert.ok(none);
  assert.equal(listed.some((key) => isWanted(none, key)), false);
  assert.equal(applyAgendaChange(skipped, { calendar: "ca_inconnu" }, calendars), null);
  assert.deepEqual(applyAgendaChange(skipped, { calendar: "ca_1" }, calendars)?.skipped, []);
  const saved = { ...skipped, calendar: calendars[0], host: { name: "Aïcha", email: "aicha@example.com", company: "Unifood", logo: "https://unifood.app.yelema.ai/logo", color: "#0f766e" } };
  assert.deepEqual(parseAgendaSettings(serializeAgendaSettings(saved)), saved);
  assert.equal(sameHost(saved.host, { ...saved.host }), true);
  assert.equal(sameHost(saved.host, { ...saved.host, logo: null }), false);
  assert.equal(sameHost(saved.host, { ...saved.host, color: null }), false);
  assert.deepEqual(parseAgendaChange({ profile: "p", mode: "all" }), { mode: "all" });
  assert.deepEqual(parseAgendaChange({ event: "google:a1", on: false }), { event: "google:a1", on: false });
  assert.equal(parseAgendaChange({ event: "../x", on: true }), null);
  assert.equal(parseAgendaChange({ mode: "jamais" }), null);
  const soon = { key: "google:a1", title: null, start: new Date(T0 + 60_000).toISOString(), end: null, link: { url: "https://meet.google.com/abc-defg-hij", platform: "meet" as const }, pending: false };
  assert.equal(schedulable(soon, T0), false);
  assert.equal(schedulable({ ...soon, start: new Date(T0 + 3_600_000).toISOString() }, T0), true);
});

test("réunion programmée : statut, titre de l'agenda et section à venir", () => {
  const event = { key: "google:a1", title: "Point hebdo", start: "2026-11-21T09:00:00.000Z", end: "2026-11-21T09:30:00.000Z" };
  const r = newMeetingRecord("261120-080000", { url: "https://meet.google.com/abc-defg-hij", platform: "meet" }, { name: "Aïcha", email: null }, BYLINE, new Date(T0), event);
  assert.equal(r.phase, "scheduled");
  assert.deepEqual(parseMeetingRecord(serializeRecord(r))?.event, event);
  const view = meetingView({ ...r, botId: BOT }, null, T0);
  assert.equal(view.status, "scheduled");
  assert.equal(meetingTitle(view), "Point hebdo");
  assert.equal(listMeta(view, new Date("2026-11-20T12:00:00Z"), "UTC"), "Demain, 09:00");
  assert.equal(phaseOf({ status: "Scheduled", joinedAt: null, endedAt: null, attributes: {} }), "scheduled");
});

test("intitulé du jour : aujourd’hui, demain, puis le jour en toutes lettres", () => {
  const now = new Date("2026-11-20T08:00:00Z");
  assert.equal(dayHeading(new Date("2026-11-20T15:00:00Z"), now, "UTC"), "Aujourd’hui");
  assert.equal(dayHeading(new Date("2026-11-21T15:00:00Z"), now, "UTC"), "Demain");
  assert.equal(dayHeading(new Date("2026-11-23T15:00:00Z"), now, "UTC"), "Lundi 23 novembre");
});
