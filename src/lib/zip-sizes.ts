// The inflated size of each part of a zip (docx, xlsx, pptx), read from the archive's own directory before
// anything is inflated: a preview refuses a part too large for the tab. Pure: tested against jszip.

const EOCD = 0x06054b50;
const ENTRY = 0x02014b50;
const MAX_ENTRIES = 20_000;

/** Part name → inflated bytes as the directory declares them (Infinity for a zip64 entry). Empty when `data` is no zip. */
export function zipSizes(data: ArrayBuffer): Map<string, number> {
  const out = new Map<string, number>();
  const view = new DataView(data);
  let end = -1;
  for (let i = view.byteLength - 22; i >= Math.max(0, view.byteLength - 65_557); i--) {
    if (view.getUint32(i, true) === EOCD) {
      end = i;
      break;
    }
  }
  if (end < 0) return out;
  const count = Math.min(view.getUint16(end + 10, true), MAX_ENTRIES);
  let at = view.getUint32(end + 16, true);
  const utf8 = new TextDecoder();
  for (let n = 0; n < count && at + 46 <= view.byteLength && view.getUint32(at, true) === ENTRY; n++) {
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const name = utf8.decode(new Uint8Array(data, at + 46, Math.min(nameLength, view.byteLength - at - 46)));
    out.set(name, size === 0xffffffff ? Infinity : size);
    at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  }
  return out;
}

const opened = new WeakMap<object, Map<string, number>>();

/** `load(data)`, its archive remembered with the sizes of its parts for `inflatedBytes`. */
export async function openZip<Z extends object>(load: (data: ArrayBuffer) => Promise<Z>, data: ArrayBuffer): Promise<Z> {
  const zip = await load(data);
  opened.set(zip, zipSizes(data));
  return zip;
}

/** The inflated size of `path` in an archive opened by `openZip`; Infinity when unknown, so a guard refuses it. */
export const inflatedBytes = (zip: object, path: string): number => opened.get(zip)?.get(path) ?? Infinity;

/** The inflated size of the whole archive. */
export const zipTotalBytes = (data: ArrayBuffer): number => [...zipSizes(data).values()].reduce((a, b) => a + b, 0);
