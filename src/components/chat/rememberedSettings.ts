import type { ChatSettings } from "./types";

// The model and effort last chosen, kept from one screen to the next (Myriel, Leslie 30/10): the
// home's chat bar, an Expert's and the chat d'entreprise show the same choice. Per browser; a model
// an Expert does not offer is dropped where it is read (`findModel`).
const KEY = "yelema.chat-reglages";
const NONE: ChatSettings = { model: null, provider: null, reasoningEffort: null };

export function rememberedSettings(): ChatSettings {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return v && typeof v === "object" ? { ...NONE, ...v } : NONE;
  } catch {
    return NONE;
  }
}

export function rememberSettings(s: ChatSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}
