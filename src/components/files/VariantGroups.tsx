"use client";

import { Preview as DocPreview } from "@/components/chat/DocumentCards";
import { ReducedImage } from "./FilePreview";
import { thumbUrl, type FileEntry } from "./types";
import { docKind } from "@/lib/drive-links";
import type { VariantGroup } from "@/lib/visual-variants";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// A folder of visuals shown by visual (Myriel, Leslie 30/10): one group per variant, one card per
// format with its picture, and a badge per file (PDF, JPG, PNG) that opens it in the preview.
export function VariantGroups({ agentId, groups, onOpen }: { agentId: string; groups: VariantGroup<FileEntry>[]; onOpen: (entry: FileEntry) => void }) {
  return (
    <div className="flex flex-col gap-6">
      {groups.map((g) => (
        <section key={g.variant}>
          <h3 className="flex items-baseline gap-2 font-display text-lg font-bold text-ink">
            {cap(g.variant)}
            <small className="text-[13px] font-medium text-ink-3">
              {g.formats.length} {g.formats.length > 1 ? "formats" : "format"} · {g.formats.reduce((n, f) => n + f.files.length, 0)} fichiers
            </small>
          </h3>
          <ul className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
            {g.formats.map((f) => {
              const cover = f.files[0].file;
              const kind = docKind(cover.name);
              return (
                <li key={f.format} className="overflow-hidden rounded-lg border bg-card">
                  <button type="button" onClick={() => onOpen(cover)} className="block h-48 w-full overflow-hidden bg-secondary/40" aria-label={`Aperçu ${cap(g.variant)} ${f.format}`}>
                    {kind === "image" ? (
                      <ReducedImage thumb={thumbUrl(agentId, cover.path, 480, cover.modified)} original={thumbUrl(agentId, cover.path, 480)} alt="" className="size-full object-contain p-2" />
                    ) : (
                      <span className="pointer-events-none block size-full">
                        <DocPreview agentId={agentId} doc={{ name: cover.name, path: cover.path, size: cover.size ?? null, modified: cover.modified ?? null, kind }} />
                      </span>
                    )}
                  </button>
                  <div className="p-3">
                    <p className="text-sm font-semibold text-foreground">{cap(f.format)}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {f.files.map(({ file, ext }) => (
                        <button
                          key={file.path}
                          type="button"
                          onClick={() => onOpen(file)}
                          className="inline-flex h-9 items-center rounded-full border px-3 text-xs font-bold text-foreground hover:bg-secondary"
                        >
                          {ext.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
