// A folder of visuals made in several variants and formats (Myriel, Leslie 30/10: 18 flyers =
// 3 variants × 2 formats × 3 files), named by the convention AAMMJJ_client_projet_variante_format.ext
// (« 261029_unifood_jmj_basique_story.pdf »). Grouped by variant, then by format, each with its
// files (PDF, JPG, PNG…). A name off the convention is left to the plain list. No imports: tested.

export interface VariantFile<F> {
  file: F;
  ext: string;
}
export interface VariantFormat<F> {
  format: string;
  files: VariantFile<F>[];
}
export interface VariantGroup<F> {
  variant: string;
  formats: VariantFormat<F>[];
}

const NAME = /^\d{6}_[^_]+_[^_]+_([^_]+)_([^_.]+)\.([a-z0-9]+)$/i;

/** The visuals of a folder by variant and format, or null when fewer than two files follow the convention. */
export function groupVariants<F extends { name: string }>(files: readonly F[]): { groups: VariantGroup<F>[]; grouped: Set<F> } | null {
  const groups: VariantGroup<F>[] = [];
  const grouped = new Set<F>();
  for (const file of files) {
    const m = NAME.exec(file.name);
    if (!m) continue;
    const [, variant, format, ext] = m;
    let g = groups.find((x) => x.variant.toLowerCase() === variant.toLowerCase());
    if (!g) groups.push((g = { variant, formats: [] }));
    let f = g.formats.find((x) => x.format.toLowerCase() === format.toLowerCase());
    if (!f) g.formats.push((f = { format, files: [] }));
    f.files.push({ file, ext: ext.toLowerCase() });
    grouped.add(file);
  }
  if (grouped.size < 2) return null;
  // Within a format, the picture to show first, then the print file.
  const order = ["png", "jpg", "jpeg", "webp", "pdf"];
  const rank = (e: string) => (order.includes(e) ? order.indexOf(e) : order.length);
  for (const g of groups) for (const f of g.formats) f.files.sort((a, b) => rank(a.ext) - rank(b.ext));
  return { groups, grouped };
}

/** « source », « sources »: the editable files (HTML, images, fonts) a deliverable was made from. */
export const isSourceFolder = (name: string) => /^_?sources?$/i.test(name.trim());
