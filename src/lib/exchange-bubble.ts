// La largeur maximale en % vit sur la rangée, mesurée sur la colonne du fil : posée sur la bulle, elle se mesurait
// sur la rangée qui épouse la bulle, d'où une bulle à 90 % d'elle-même et « hey » coupé en « he / y ».
// Limite de lecture (~80 caractères), qui suit la taille du texte et la colonne : 90 % sur mobile, 70ch au plus ailleurs.
export const BUBBLE_ROW = "flex min-w-0 max-w-[min(90%,70ch)]";
export const BUBBLE = "relative min-w-0 max-w-full break-words rounded-2xl px-3.5 py-2.5 text-ink";
