// What an expert says to itself between two tools (« Now format headers and widths. ») is not for the member: a line
// in English is the model's own working note. Shown while the tools run (#192), only French lines addressed to the
// person stay (Leslie, 23/11 : « anglais, bizarre ici »).

const EN = new Set(
  "the a an and or now let let's lets i i'll i'm i've we we'll it it's its is are was this that these those then next first check checking checked done okay ok good great need needs will would should can could to of for with from into on in at by format add adding update updating create creating write writing read reading file files sheet sheets column columns row rows header headers width widths data looks look see fix fixing run running build building upload uploading save saving".split(" ")
);
const FR = new Set(
  "le la les un une des de du et ou je j' tu il elle nous vous on est sont c'est ce cette ces pour avec dans sur par au aux que qui ne pas plus votre vos mon ma mes son sa ses leur voici je vais j'ai fait faire mets ajoute prépare relis".split(" ")
);

/** True when `text` reads as a working note in English rather than a sentence to the member. */
export function isEnglishNote(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/[àâçéèêëîïôûùüÿœ«»]/i.test(t)) return false;
  const words = t.toLowerCase().match(/[a-z']+/g) ?? [];
  if (!words.length) return false;
  let en = 0;
  let fr = 0;
  for (const w of words) {
    if (EN.has(w)) en++;
    if (FR.has(w)) fr++;
  }
  return words.length >= 3 && en >= 2 && en > fr;
}

/** The lines said between tools that the member may read. */
export const forTheMember = (said: readonly string[]) => said.filter((s) => s.trim() && !isEnglishNote(s));
