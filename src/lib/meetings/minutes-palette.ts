export interface MinutesPalette {
  main: string;
  accent: string;
  pale: string;
  line: string;
  text: string;
  muted: string;
  bg: string;
  free: string;
}

const YELEMA_MAIN = "#301667";
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const MIN_CONTRAST_ON_WHITE = 4.5;

export const isHexColor = (value: unknown): value is string => typeof value === "string" && HEX_COLOR.test(value);

const channels = (hex: string): [number, number, number] => [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16)) as [number, number, number];

const hexOf = (rgb: readonly number[]): string => `#${rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("")}`;

const mix = (hex: string, toward: number, share: number): string => hexOf(channels(hex).map((c) => c + (toward - c) * share));

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const contrastOnWhite = (hex: string): number => 1.05 / (luminance(hex) + 0.05);

function readableOnWhite(hex: string): string {
  let color = hex;
  for (let step = 0; step < 20 && contrastOnWhite(color) < MIN_CONTRAST_ON_WHITE; step += 1) color = mix(color, 0, 0.1);
  return color;
}

export function paletteOf(brandColor: string | null | undefined): MinutesPalette {
  const main = readableOnWhite(isHexColor(brandColor) ? brandColor.toLowerCase() : YELEMA_MAIN);
  return {
    main,
    accent: main,
    pale: mix(main, 255, 0.92),
    line: "#e3e8ef",
    text: "#1f2433",
    muted: "#667085",
    bg: "#f4f6f9",
    free: "#b54708",
  };
}
