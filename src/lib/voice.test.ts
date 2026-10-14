import assert from "node:assert/strict";
import { test } from "node:test";
import { callHeaders, chosenVoice, parseVoicePrefs, signalingStep } from "./voice.ts";

test("a relayed step is only one the SDK sends, with its own method", () => {
  assert.equal(signalingStep("conv_abc-1", "offer", "POST"), "offer");
  assert.equal(signalingStep("conv_abc-1", "ice", "PATCH"), "ice");
  assert.equal(signalingStep("conv_abc-1", "status", "GET"), "status");
  for (const [id, action, method] of [
    ["conv", "ice", "POST"],
    ["conv", "status", "POST"],
    ["conv", "delete", "POST"],
    ["conv", "toString", "POST"],
    ["../x", "end", "POST"],
    ["a/b", "end", "POST"],
    ["", "end", "POST"],
  ]) {
    assert.equal(signalingStep(id, action, method), null, `${id} ${action} ${method}`);
  }
});

test("call headers: expert and language required, voice optional, all normalised", () => {
  assert.deepEqual(callHeaders(new Headers({ "x-yelema-expert": " Koffi ", "x-yelema-language": "FR", "x-yelema-voice": "Moussa" })), {
    "X-Yelema-Expert": "koffi",
    "X-Yelema-Language": "fr",
    "X-Yelema-Voice": "moussa",
  });
  assert.deepEqual(callHeaders(new Headers({ "x-yelema-expert": "koffi", "x-yelema-language": "en" })), { "X-Yelema-Expert": "koffi", "X-Yelema-Language": "en" });
  assert.equal(callHeaders(new Headers({ "x-yelema-language": "fr" })), null);
  assert.equal(callHeaders(new Headers({ "x-yelema-expert": "koffi", "x-yelema-language": "de" })), null);
  assert.equal(callHeaders(new Headers({ "x-yelema-expert": "koffi", "x-yelema-language": "fr", "x-yelema-voice": "a/b" })), null);
});

test("the voice of a call: the one chosen for the language, else its default, else its first", () => {
  const v = (key: string, language: "fr" | "en", isDefault = false) => ({ key, label: key, language, gender: "female" as const, country: "CI", previewUrl: "", default: isDefault });
  const voices = [v("adjoua", "fr"), v("akissi", "fr", true), v("amelia", "en")];
  assert.equal(chosenVoice(voices, { language: "fr", voices: { fr: "adjoua" } })?.key, "adjoua");
  assert.equal(chosenVoice(voices, { language: "fr", voices: {} })?.key, "akissi");
  assert.equal(chosenVoice(voices, { language: "fr", voices: { fr: "retiree" } })?.key, "akissi");
  assert.equal(chosenVoice(voices, { language: "en", voices: { fr: "adjoua" } })?.key, "amelia");
  assert.equal(chosenVoice([], { language: "fr", voices: {} }), null);
});

test("stored voice settings: read leniently, anything unreadable is no setting", () => {
  assert.deepEqual(parseVoicePrefs('{"language":"en","voices":{"en":"nana"}}'), { language: "en", voices: { en: "nana" } });
  assert.deepEqual(parseVoicePrefs('{"language":"de"}'), { language: "fr", voices: {} });
  assert.equal(parseVoicePrefs(null), null);
  assert.equal(parseVoicePrefs("{oops"), null);
});
