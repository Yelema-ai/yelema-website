export const TINTED_ICONS = ["calendar", "clock", "users", "pin", "decisions-c", "actions-c", "questions-c", "qui", "quand"] as const;
const PLAIN_ICONS = ["essentiel", "decisions", "actions", "questions", "attribuer"] as const;

export type TintedIcon = (typeof TINTED_ICONS)[number];
export type EmailIcon = TintedIcon | (typeof PLAIN_ICONS)[number];

export const EMAIL_ASSETS_PATH = "/meetings/email";
export const ICON_ROUTE_PATH = "/api/meetings/icons";

export const isTintedIcon = (name: string): name is TintedIcon => (TINTED_ICONS as readonly string[]).includes(name);

export function iconUrl(origin: string, name: EmailIcon, color: string): string {
  return isTintedIcon(name) ? `${origin}${ICON_ROUTE_PATH}/${name}.png?c=${color.replace(/^#/, "")}` : `${origin}${EMAIL_ASSETS_PATH}/${name}.png`;
}

export const yelemaMarkUrl = (origin: string): string => `${origin}${EMAIL_ASSETS_PATH}/yelema.png`;
