// The `memoire` MCP server's protocol, kept apart from the route so it can be tested: JSON-RPC 2.0
// over one POST per message, no session and no stream. Two tools, both answered by the back office.

export const MEMORY_TOOLS = [
  {
    name: "demander",
    description:
      "Pose une question à la mémoire de l'entreprise (règles internes, procédures, documents de référence déposés par l'entreprise) et reçoit une réponse rédigée. À utiliser avant de répondre sur un sujet propre à l'entreprise. Ne rend que ce que l'utilisateur a le droit de lire.",
    inputSchema: { type: "object", properties: { question: { type: "string", description: "La question, en une phrase complète." } }, required: ["question"] },
  },
  {
    name: "rechercher",
    description:
      "Cherche dans la mémoire de l'entreprise et rend les extraits bruts des documents trouvés, sans les reformuler. À utiliser pour citer un texte exact ou vérifier une réponse.",
    inputSchema: {
      type: "object",
      properties: { requete: { type: "string", description: "Les mots à chercher." }, limite: { type: "integer", minimum: 1, maximum: 20 } },
      required: ["requete"],
    },
  },
] as const;

export interface MemoryBackend {
  ask(question: string): Promise<string | null>;
  search(query: string, limit: number | undefined): Promise<{ title: string; excerpt: string }[]>;
}

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
type RpcAnswer = { jsonrpc: "2.0"; id: string | number | null; result?: unknown; error?: { code: number; message: string } };

const NOTHING = "La mémoire de l'entreprise ne contient rien de lisible sur ce sujet.";
const text = (value: string, isError = false) => ({ content: [{ type: "text", text: value }], ...(isError ? { isError: true } : {}) });

async function callTool(backend: MemoryBackend, name: unknown, args: Record<string, unknown>) {
  if (name === "demander") {
    if (typeof args.question !== "string") return text("Argument « question » requis.", true);
    return text((await backend.ask(args.question)) ?? NOTHING);
  }
  if (name === "rechercher") {
    if (typeof args.requete !== "string") return text("Argument « requete » requis.", true);
    const hits = await backend.search(args.requete, typeof args.limite === "number" ? args.limite : undefined);
    return text(hits.length ? hits.map((h) => `## ${h.title || "Sans titre"}\n${h.excerpt}`).join("\n\n") : NOTHING);
  }
  return text("Outil inconnu.", true);
}

/**
 * Answers one JSON-RPC message; null for a notification, which takes no answer. A failure of the
 * back office inside a tool call is told to the expert as a tool error, in its own sentence.
 */
export async function answerRpc(message: unknown, backend: MemoryBackend): Promise<RpcAnswer | null> {
  const rpc = (message && typeof message === "object" ? message : {}) as Rpc;
  const id = rpc.id ?? null;
  if (rpc.jsonrpc !== "2.0" || typeof rpc.method !== "string") return { jsonrpc: "2.0", id, error: { code: -32600, message: "Invalid Request" } };
  if (rpc.id === undefined) return null;
  const ok = (result: unknown): RpcAnswer => ({ jsonrpc: "2.0", id, result });
  switch (rpc.method) {
    case "initialize":
      return ok({
        protocolVersion: typeof rpc.params?.protocolVersion === "string" ? rpc.params.protocolVersion : "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "memoire", version: "1.0.0" },
      });
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: MEMORY_TOOLS });
    case "tools/call": {
      const args = rpc.params?.arguments;
      try {
        return ok(await callTool(backend, rpc.params?.name, args && typeof args === "object" ? (args as Record<string, unknown>) : {}));
      } catch (e) {
        if ((e as { status?: number }).status === 401) throw e;
        return ok(text(e instanceof Error && e.message ? e.message : "La mémoire de l'entreprise est momentanément indisponible.", true));
      }
    }
    default:
      return { jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } };
  }
}
