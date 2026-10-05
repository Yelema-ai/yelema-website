#!/bin/bash
# Yelema brings its own Composio, so Agent37's managed one stays off. The platform injects the
# switch as "on" at every container start, so it is turned off here, before the stock entrypoint
# writes each Hermes config. Then Yelema's `apps` MCP server is wired into every profile, and Hermes's
# API server is turned on for the app's Routines tab, and the experts' screen starts (it waits for the
# display the stock entrypoint brings up).
export AGENT37_HERMES_COMPOSIO_ENABLED=false AGENT37_MANAGED_PLUGIN_COMPOSIO_ENABLED=false
"${HERMES_PYTHON:-/usr/local/lib/hermes/hermes-agent/venv/bin/python}" /usr/local/bin/yelema-apps-mcp.py \
  || echo "[yelema-hermes] apps MCP wiring failed; the experts start without their connected apps" >&2
"${HERMES_PYTHON:-/usr/local/lib/hermes/hermes-agent/venv/bin/python}" /usr/local/bin/yelema-api-server.py \
  || echo "[yelema-hermes] API server setup failed; the app cannot reach the experts' routines" >&2
/usr/local/bin/yelema-desktop.sh \
  || echo "[yelema-hermes] the experts' screen failed to start; \"Son ordinateur\" stays blank" >&2
exec /usr/local/bin/entrypoint.sh "$@"
