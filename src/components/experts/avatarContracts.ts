/**
 * Contrats et options pour la personnalisation d'avatar d'un expert.
 * Issu de l'architecture originale Yelema web-app (4 axes de génération).
 */

export type AvatarPosition =
  | 'auto'
  | 'face'
  | 'trois-quarts'
  | 'profil'
  | 'bras-croises'
  | 'assis'
  | 'marche'
  | 'reunion';

export type AvatarStyle =
  | 'auto'
  | 'casual'
  | 'smart-casual'
  | 'blazer'
  | 'business'
  | 'traditionnel'
  | 'terrain'
  | 'ceremonie';

export type AvatarAccessory =
  | 'auto'
  | 'aucun'
  | 'casque'
  | 'ordinateur'
  | 'tablette'
  | 'telephone'
  | 'documents'
  | 'badge'
  | 'lunettes';

export type AvatarBackground =
  | 'auto'
  | 'blanc'
  | 'beige'
  | 'gris'
  | 'violet'
  | 'bleu'
  | 'vert'
  | 'fonce';

export interface AgentAvatarConfig {
  position: AvatarPosition;
  style: AvatarStyle;
  accessory: AvatarAccessory;
  background: AvatarBackground;
}

export const DEFAULT_AVATAR_CONFIG: AgentAvatarConfig = {
  position: 'auto',
  style: 'auto',
  accessory: 'auto',
  background: 'auto',
};

export const AVATAR_POSITION_LABELS: Record<AvatarPosition, string> = {
  auto: 'Auto',
  face: 'Face',
  'trois-quarts': '3/4',
  profil: 'Profil',
  'bras-croises': 'Bras croisés',
  assis: 'Assis',
  marche: 'En marche',
  reunion: 'En réunion',
};

export const AVATAR_STYLE_LABELS: Record<AvatarStyle, string> = {
  auto: 'Auto',
  casual: 'Décontracté',
  'smart-casual': 'Ville',
  blazer: 'Blazer',
  business: 'Costume',
  traditionnel: 'Traditionnel',
  terrain: 'Terrain',
  ceremonie: 'Cérémonie',
};

export const AVATAR_ACCESSORY_LABELS: Record<AvatarAccessory, string> = {
  auto: 'Auto',
  aucun: 'Aucun',
  casque: 'Casque audio',
  ordinateur: 'Ordinateur',
  tablette: 'Tablette',
  telephone: 'Téléphone',
  documents: 'Documents',
  badge: 'Badge pro',
  lunettes: 'Lunettes',
};

export const AVATAR_BACKGROUND_LABELS: Record<AvatarBackground, string> = {
  auto: 'Auto',
  blanc: 'Blanc pur',
  beige: 'Beige chaud',
  gris: 'Gris studio',
  violet: 'Violet Yelema',
  bleu: 'Bleu pastel',
  vert: 'Vert sauge',
  fonce: 'Bleu nuit',
};

export const AVATAR_BACKGROUND_COLORS: Record<AvatarBackground, string> = {
  auto: '#e8e4d8',
  blanc: '#f6f7f9',
  beige: '#e4dcc8',
  gris: '#dfe3ea',
  violet: '#8b6bb1',
  bleu: '#cfe0f2',
  vert: '#d6e8d8',
  fonce: '#1e2238',
};
