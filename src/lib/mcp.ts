import "server-only";
import { agent37 } from "@/lib/agent37";
import { ApiError } from "@/lib/http";

export interface McpServerInfo {
  name: string;
  url: string;
  transport?: string;
  isManaged?: boolean;
  status: "active" | "error";
  hasAuth: boolean;
  authType?: "none" | "bearer" | "oauth";
}

export interface AddMcpServerInput {
  name: string;
  transport?: "HTTP/SSE" | "Stdio";
  url: string;
  authType: "none" | "bearer" | "oauth";
  token?: string;
}

const PYTHON = "/usr/local/lib/hermes/hermes-agent/venv/bin/python";

/**
 * List all configured MCP servers on the agent's instance from ~/.hermes/config.yaml
 */
export async function listInstanceMcpServers(instanceId: string): Promise<McpServerInfo[]> {
  const script = `
import yaml, json, os
cfg_path = os.path.expanduser("~/.hermes/config.yaml")
if os.path.exists(cfg_path):
    with open(cfg_path, "r") as f:
        data = yaml.safe_load(f) or {}
    servers = data.get("mcp_servers", {})
    res = []
    for name, s in servers.items():
        if isinstance(s, dict):
            url = s.get("url", "")
            headers = s.get("headers", {})
            auth_field = s.get("auth", "")
            has_auth = bool(headers.get("Authorization") or headers.get("authorization") or auth_field)
            auth_type = "oauth" if auth_field == "oauth" else ("bearer" if has_auth else "none")
            res.append({
                "name": name,
                "url": url,
                "transport": "HTTP/SSE",
                "isManaged": name == "apps",
                "status": "active",
                "hasAuth": has_auth,
                "authType": auth_type
            })
    print(json.dumps(res))
else:
    print("[]")
`;

  try {
    const execRes = await agent37.exec(instanceId, `${PYTHON} -c '${script}'`);
    if (execRes.exit_code !== 0) {
      console.warn(`[mcp] list failed for ${instanceId}:`, execRes.stderr);
      return [];
    }
    const list = JSON.parse(execRes.stdout.trim() || "[]");
    return list;
  } catch (e) {
    console.warn(`[mcp] parse failed for ${instanceId}:`, e);
    return [];
  }
}

/**
 * Add or update an MCP server on the agent's instance across root config and all expert profiles
 */
export async function addInstanceMcpServer(
  instanceId: string,
  input: AddMcpServerInput
): Promise<McpServerInfo> {
  const rawName = (input.name || "").trim();
  const url = (input.url || "").trim();
  const authType = input.authType || "none";
  const token = (input.token || "").trim();

  if (!rawName) throw new ApiError(400, "invalid_name", "Le nom du serveur MCP est requis.");
  if (!url) throw new ApiError(400, "invalid_url", "L'URL du serveur MCP est requise.");
  if (authType === "bearer" && !token) {
    throw new ApiError(400, "invalid_key", "Le token Bearer / clé API est obligatoire.");
  }

  try {
    new URL(url);
  } catch {
    throw new ApiError(400, "invalid_url", "L'URL du serveur MCP n'est pas valide.");
  }

  // Clean name for YAML key
  const serverName = rawName.replace(/[^a-zA-Z0-9_-]/g, "_");

  const pyCode = `
import yaml, json, os, glob

name = ${JSON.stringify(serverName)}
url = ${JSON.stringify(url)}
auth_type = ${JSON.stringify(authType)}
token = ${JSON.stringify(token)}

entry = {"url": url}
if auth_type == "bearer" and token:
    auth_val = token if token.startswith("Bearer ") else f"Bearer {token}"
    entry["headers"] = {"Authorization": auth_val}
elif auth_type == "oauth":
    entry["auth"] = "oauth"

# 1. Update root ~/.hermes/config.yaml
cfg_path = os.path.expanduser("~/.hermes/config.yaml")
if os.path.exists(cfg_path):
    with open(cfg_path, "r") as f:
        data = yaml.safe_load(f) or {}
else:
    data = {}

if "mcp_servers" not in data or not isinstance(data["mcp_servers"], dict):
    data["mcp_servers"] = {}

data["mcp_servers"][name] = entry

with open(cfg_path, "w") as f:
    yaml.safe_dump(data, f, default_flow_style=False)

# 2. Sync to all expert profiles ~/.hermes/profiles/*/config.yaml
for p in glob.glob(os.path.expanduser("~/.hermes/profiles/*")):
    prof_cfg = os.path.join(p, "config.yaml")
    if os.path.isfile(prof_cfg):
        try:
            with open(prof_cfg, "r") as f:
                pdata = yaml.safe_load(f) or {}
            if "mcp_servers" not in pdata or not isinstance(pdata["mcp_servers"], dict):
                pdata["mcp_servers"] = {}
            pdata["mcp_servers"][name] = entry
            with open(prof_cfg, "w") as f:
                yaml.safe_dump(pdata, f, default_flow_style=False)
        except Exception as e:
            print(f"WARN profile sync: {e}")

print("SUCCESS")
`;

  const execRes = await agent37.exec(instanceId, `${PYTHON} -c '${pyCode}'`);
  if (execRes.exit_code !== 0 || !execRes.stdout.includes("SUCCESS")) {
    console.error(`[mcp] add failed for ${instanceId}:`, execRes.stderr || execRes.stdout);
    throw new ApiError(502, "mcp_config_failed", "Impossible d'enregistrer le serveur MCP sur l'instance.");
  }

  // Pre-test the MCP connection and restart worker so the agent tool registry loads immediately
  try {
    await agent37.exec(
      instanceId,
      `(/usr/local/lib/hermes/hermes-agent/venv/bin/hermes mcp test ${serverName} >/dev/null 2>&1 || true) && pkill -9 -f hermes_worker.py || true`
    );
  } catch (err) {
    console.warn("[mcp] worker reload warn:", err);
  }

  return {
    name: serverName,
    url,
    transport: "HTTP/SSE",
    isManaged: false,
    status: "active",
    hasAuth: authType !== "none",
    authType,
  };
}

/**
 * Remove an MCP server from the agent's instance across root config and all expert profiles
 */
export async function removeInstanceMcpServer(instanceId: string, name: string): Promise<void> {
  if (name === "apps") {
    throw new ApiError(400, "protected_server", "Le serveur MCP par défaut de Yelema ne peut pas être supprimé.");
  }

  const pyCode = `
import yaml, os, glob

name = ${JSON.stringify(name)}

# 1. Root config
cfg_path = os.path.expanduser("~/.hermes/config.yaml")
if os.path.exists(cfg_path):
    with open(cfg_path, "r") as f:
        data = yaml.safe_load(f) or {}
    if "mcp_servers" in data and isinstance(data["mcp_servers"], dict) and name in data["mcp_servers"]:
        del data["mcp_servers"][name]
        with open(cfg_path, "w") as f:
            yaml.safe_dump(data, f, default_flow_style=False)

# 2. Expert profiles
for p in glob.glob(os.path.expanduser("~/.hermes/profiles/*")):
    prof_cfg = os.path.join(p, "config.yaml")
    if os.path.isfile(prof_cfg):
        try:
            with open(prof_cfg, "r") as f:
                pdata = yaml.safe_load(f) or {}
            if "mcp_servers" in pdata and isinstance(pdata["mcp_servers"], dict) and name in pdata["mcp_servers"]:
                del pdata["mcp_servers"][name]
                with open(prof_cfg, "w") as f:
                    yaml.safe_dump(pdata, f, default_flow_style=False)
        except Exception:
            pass

print("SUCCESS")
`;

  const execRes = await agent37.exec(instanceId, `${PYTHON} -c '${pyCode}'`);
  if (execRes.exit_code !== 0) {
    console.error(`[mcp] delete failed for ${instanceId}:`, execRes.stderr);
    throw new ApiError(502, "mcp_delete_failed", "Impossible de supprimer le serveur MCP.");
  }

  // Force reload running worker
  try {
    await agent37.exec(instanceId, "pkill -9 -f hermes_worker.py || true");
  } catch {
    // ignore
  }
}
