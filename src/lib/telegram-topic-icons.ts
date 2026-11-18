// Icon of each expert's Telegram topic: [Christelle's ExpertYelema pack emoji, fallback from
// getForumTopicIconStickers (the only ones guaranteed for a bot)]. Mirror of the gateway's
// apps/runtime-gateway/src/telegram/topicIcons.ts.
export const TOPIC_ICONS: Record<string, readonly [string | null, string]> = {
  adjoua: ["5969576054027722422", "5309965701241379366"], // 🔎 recrutement
  alioune: ["5969618157592128985", "5309958691854754293"], // 💎 investissement
  awa: ["5969774936783330236", "5417915203100613993"], // 💬 support client
  djeneba: ["5969914433026138152", "5433614043006903194"], // 📆 assistanat de direction
  fatima: ["5969999881400491290", "5309984423003823246"], // 📣 marketing
  fatou: ["5969791682860819040", "5348227245599105972"], // 💼 RH et paie
  ibrahim: ["5971938685472481742", "5350548830041415279"], // 🏛 juridique
  koffi: ["5969991635063283359", "5310039132297242441"], // 🎨 design de marque
  kouassi: ["5969773764257258928", "5350452584119279096"], // 💰 commercial
  mamadou: ["5969755441926777485", "5355127101970194557"], // 🧮 finance
  nadia: ["5972007623992548834", "5350305691942788490"], // 📈 données
  salif: ["5969881847109262972", "5357315181649076022"], // 📁 opérations
  yele: [null, "5312536423851630001"], // 💡 accompagnement Yelema
};

// Icons to try in order, per profile, as a Python dict literal for the routing script on the instance.
export const TOPIC_ICONS_PY = JSON.stringify(
  Object.fromEntries(Object.entries(TOPIC_ICONS).map(([k, ids]) => [k, ids.filter((id) => id !== null)])),
);
