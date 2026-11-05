// Official face emoji of each expert's Telegram topic from the ExpertYelema pack (https://t.me/addemoji/ExpertYelema).
// Standard fallback stickers are removed: only the brand's genuine expert faces are used.
export const TOPIC_ICONS: Record<string, readonly [string]> = {
  adjoua: ["5969576054027722422"],
  alioune: ["5969618157592128985"],
  awa: ["5969774936783330236"],
  djeneba: ["5969914433026138152"],
  fatima: ["5969999881400491290"],
  fatou: ["5969791682860819040"],
  ibrahim: ["5971938685472481742"],
  koffi: ["5969991635063283359"],
  kouassi: ["5969773764257258928"],
  mamadou: ["5969755441926777485"],
  nadia: ["5972007623992548834"],
  salif: ["5969881847109262972"],
  yele: ["5312536423851630001"], // 💡 accompagnement Yelema
};

// Icons to try in order, per profile, as a Python dict literal for the routing script on the instance.
export const TOPIC_ICONS_PY = JSON.stringify(
  Object.fromEntries(Object.entries(TOPIC_ICONS).map(([k, ids]) => [k, ids])),
);
