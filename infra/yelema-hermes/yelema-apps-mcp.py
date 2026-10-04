#!/usr/bin/env python3
# Wires Yelema's Composio into Hermes as the `apps` MCP server: the Yelema app's /api/composio-mcp
# proxy, with this instance's token. Provisioning writes both to ~/.yelema/apps-mcp.json
# ({"url": ..., "token": ...}); this copies them into the root config and every profile's config
# at each start, so a profile installed later gets them too. The stock entrypoint keeps the entry
# (it only manages `composio`). No state file: nothing to wire.
import glob
import json
import os

import yaml

home = os.path.expanduser("~")
try:
    with open(os.path.join(home, ".yelema", "apps-mcp.json"), encoding="utf-8") as f:
        state = json.load(f)
except (OSError, ValueError):
    raise SystemExit(0)
if not (isinstance(state, dict) and state.get("url") and state.get("token")):
    raise SystemExit(0)

server = {"url": state["url"], "headers": {"Authorization": f"Bearer {state['token']}"}}
paths = [os.path.join(home, ".hermes", "config.yaml")]
paths += sorted(glob.glob(os.path.join(home, ".hermes", "profiles", "*", "config.yaml")))
for path in paths:
    if not os.path.exists(path):
        continue
    with open(path, encoding="utf-8") as f:
        config = yaml.safe_load(f) or {}
    if not isinstance(config, dict):
        continue
    servers = config.get("mcp_servers") if isinstance(config.get("mcp_servers"), dict) else {}
    if servers.get("apps") == server:
        continue
    servers["apps"] = server
    config["mcp_servers"] = servers
    with open(path, "w", encoding="utf-8") as f:
        yaml.safe_dump(config, f, sort_keys=False)
