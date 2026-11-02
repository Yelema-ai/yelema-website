// The bridge between an expert's Livrables and its apps (Drive, Gmail…). Composio's file inputs
// (Drive's `file_to_upload`, Gmail's `attachment`…) take no local path: only a file already staged
// in Composio's storage, given as { name, mimetype, s3key }. The instance's disk is out of
// Composio's reach, so the MCP proxy (src/app/api/composio-mcp/route.ts) adds one tool of its own
// to the expert's `apps` server: it reads the file from the instance's drive, stages it, and
// answers that descriptor, which the expert then passes as is to the tool that takes the file.
// Pure and without imports, so `node --test` runs it as it is.

export const BRIDGE_TOOL = "YELEMA_PREPARER_FICHIER";

// Gmail's own ceiling for an attachment; Drive takes more, but a heavier file is not a deliverable.
export const MAX_BRIDGE_BYTES = 25 * 1024 * 1024;

export const BRIDGE_TOOL_DEFINITION = {
  name: BRIDGE_TOOL,
  title: "Préparer un fichier de mes Livrables",
  description:
    "Rend un fichier de tes Livrables (PDF, image, tableur…) utilisable par un outil d'application qui demande un fichier : " +
    "Google Drive (GOOGLEDRIVE_UPLOAD_FILE, champ file_to_upload), Gmail (GMAIL_SEND_EMAIL ou GMAIL_CREATE_EMAIL_DRAFT, champ attachment), etc. " +
    "Donne le chemin du fichier (~/Livrables/<ton prénom>/…) et le nom exact de l'outil qui va le recevoir. " +
    "La réponse est un objet { name, mimetype, s3key } : passe-le tel quel dans le champ fichier de cet outil, sans le modifier. " +
    "Un chemin local passé directement à ces outils est toujours refusé : passe d'abord par ici. " +
    "Les règles d'envoi ne changent pas : un e-mail vers l'extérieur attend toujours l'accord d'un humain.",
  inputSchema: {
    type: "object",
    properties: {
      chemin: { type: "string", description: "Chemin du fichier dans tes Livrables, par exemple ~/Livrables/Kouassi/Devis/devis.pdf" },
      outil: { type: "string", description: "Nom exact de l'outil qui recevra le fichier, par exemple GOOGLEDRIVE_UPLOAD_FILE ou GMAIL_SEND_EMAIL" },
    },
    required: ["chemin", "outil"],
    additionalProperties: false,
  },
} as const;

const DRIVE_ROOT = "~/Livrables";
const TOOL_SLUG = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/;

/** The drive path the files API takes (`~/Livrables/…`), from what an expert writes; null when it is outside the drive. */
export function bridgePath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let path = raw.trim().replace(/\/+/g, "/");
  if (path.startsWith("/home/node/Livrables/")) path = `${DRIVE_ROOT}/${path.slice("/home/node/Livrables/".length)}`;
  else if (path.startsWith("Livrables/")) path = `~/${path}`;
  if (!path.startsWith(`${DRIVE_ROOT}/`)) return null;
  const parts = path.split("/");
  // A folder is not a file, and a path that climbs out of the drive reaches the instance's keys.
  if (parts.some((p) => p === ".." || p === ".") || !parts[parts.length - 1]) return null;
  return path;
}

/** The tool slug, upper-cased; null when it does not look like one (`TOOLKIT_ACTION`). */
export function bridgeToolSlug(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const slug = raw.trim().toUpperCase();
  return TOOL_SLUG.test(slug) && slug.length <= 128 ? slug : null;
}

/** The toolkit a tool belongs to, as Composio names it: GOOGLEDRIVE_UPLOAD_FILE → googledrive. */
export function toolkitOf(slug: string): string {
  return slug.split("_")[0].toLowerCase();
}

export function fileNameOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

const TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  html: "text/html",
  json: "application/json",
  zip: "application/zip",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
};

/** The file's type: from its extension first (the files API may answer a generic type), then the header. */
export function mimeOf(name: string, header: string | null): string {
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";
  if (TYPES[ext]) return TYPES[ext];
  const fromHeader = (header ?? "").split(";")[0].trim().toLowerCase();
  return fromHeader || "application/octet-stream";
}

type Rpc = { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: { name?: unknown; arguments?: unknown } };

/** The request's single JSON-RPC message, when it calls the bridge tool. A batch is left to Composio. */
export function bridgeCall(bodyText: string): { id: unknown; args: Record<string, unknown> } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return null;
  }
  const m = parsed as Rpc | null;
  if (!m || Array.isArray(m) || m.method !== "tools/call" || m.params?.name !== BRIDGE_TOOL) return null;
  const args = m.params?.arguments;
  return { id: m.id ?? null, args: args && typeof args === "object" && !Array.isArray(args) ? (args as Record<string, unknown>) : {} };
}

/** True when the request is a single `tools/list`: its answer gets the bridge tool. */
export function isToolsList(bodyText: string): boolean {
  try {
    const m = JSON.parse(bodyText) as Rpc | null;
    return !!m && !Array.isArray(m) && m.method === "tools/list";
  } catch {
    return false;
  }
}

/** The JSON-RPC answer of a bridge call: the descriptor as text, or an error the expert can read and act on. */
export function bridgeAnswer(id: unknown, outcome: { ok: true; file: { name: string; mimetype: string; s3key: string } } | { ok: false; message: string }) {
  const text = outcome.ok ? JSON.stringify(outcome.file) : outcome.message;
  return {
    jsonrpc: "2.0",
    id,
    result: {
      content: [{ type: "text", text }],
      ...(outcome.ok ? { structuredContent: outcome.file } : {}),
      isError: !outcome.ok,
    },
  };
}

function withTool(message: unknown): unknown {
  const m = message as { result?: { tools?: unknown } } | null;
  const tools = m?.result?.tools;
  if (!Array.isArray(tools)) return message;
  if (tools.some((t) => (t as { name?: unknown })?.name === BRIDGE_TOOL)) return message;
  return { ...m, result: { ...m!.result, tools: [...tools, BRIDGE_TOOL_DEFINITION] } };
}

/**
 * Composio's answer to `tools/list` with the bridge tool added. The answer is JSON or a stream of
 * server-sent events (`data: {…}`), as the client accepted; anything that does not parse is kept as is.
 */
export function addBridgeTool(text: string, contentType: string | null): string {
  if ((contentType ?? "").includes("text/event-stream")) {
    return text
      .split("\n")
      .map((line) => {
        if (!line.startsWith("data:")) return line;
        try {
          return `data: ${JSON.stringify(withTool(JSON.parse(line.slice(5))))}`;
        } catch {
          return line;
        }
      })
      .join("\n");
  }
  try {
    return JSON.stringify(withTool(JSON.parse(text)));
  } catch {
    return text;
  }
}
