"use client";

import { memo } from "react";
import { Streamdown } from "streamdown";
import "streamdown/styles.css";

const DRIVE_PATH = String.raw`(?:/home/node|~)/Livrables/[^\s)\]\x60]+\.[A-Za-z0-9]{1,6}`;
// [label](file:///home/node/Livrables/…) or [label](~/Livrables/…)
const LINKED = new RegExp(String.raw`\]\((?:file://)?(${DRIVE_PATH})\)`, "g");
// `~/Livrables/Fatima/post.docx` or a bare path in the text
const CODE = new RegExp("`((?:/home/node|~)/Livrables/[^`\\n]+\\.[A-Za-z0-9]{1,6})`", "g");
const BARE = new RegExp(String.raw`(^|[\s(«"])(${DRIVE_PATH})`, "gm");

// Experts give the drive path of what they saved; turn those paths into download links (the
// browser can't open file:// links or instance paths, and Streamdown blocks them).
function linkDriveFiles(content: string, agentId: string): string {
  const url = (path: string) =>
    `/api/agents/${agentId}/files/content?path=${encodeURIComponent(safeDecode(path))}&disposition=attachment`;
  const name = (path: string) => safeDecode(path.split("/").pop() ?? path);
  return content
    .replace(LINKED, (_m, path: string) => `](${url(path)})`)
    .replace(CODE, (_m, path: string) => `[${name(path)}](${url(path)})`)
    .replace(BARE, (_m, lead: string, path: string) => `${lead}[${name(path)}](${url(path)})`);
}

function safeDecode(s: string): string {
  try {
    return decodeURI(s);
  } catch {
    return s;
  }
}

// Streaming-aware markdown: Streamdown tolerates incomplete markdown (unclosed fences, partial
// tables) so we can feed it the running output buffer on every delta without flicker.
export const Markdown = memo(function Markdown({ content, agentId }: { content: string; agentId?: string }) {
  return (
    <Streamdown className="chat-markdown text-[15px] leading-relaxed">
      {agentId ? linkDriveFiles(content, agentId) : content}
    </Streamdown>
  );
});
