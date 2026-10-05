# yelema-hermes

The Agent37 workspace template every Yelema client instance runs: the stock `agent37-hermes`
image (Hermes + the Agent37 gateway + managed model wiring) plus the PDF tools the expert skills
call, with Yelema's own Composio in place of Agent37's:

- `yelema-entrypoint.sh` switches Agent37's managed Composio off, then starts the stock entrypoint.
- `yelema-apps-mcp.py` adds the `apps` MCP server (the app's `/api/composio-mcp`) to every Hermes
  profile at each start, from `~/.yelema/apps-mcp.json`, which provisioning writes.
- `yelema-api-server.py` turns on Hermes's API server on port 8642, where the app manages the
  experts' routines (`/p/<expert>/api/jobs`). Its key is made on the instance at first start
  (`~/.yelema/api-server-key`, which the app reads through the Agent37 files API) and written into
  every profile's `.env` at each start. Requests need both the Agent37 key and this one.
- `yelema-desktop.sh` puts the experts' browser on a screen the app shows under "Son ordinateur":
  Agent37's [hermes-vnc-desktop](https://github.com/agent37-platform/examples/tree/main/custom-images/hermes-vnc-desktop)
  recipe. A visible Chromium (DevTools on loopback 9222, which `BROWSER_CDP_URL` points every expert
  at) on the stock display, streamed by x11vnc and websockify on port 6901, where the app's noVNC
  client connects with a signed URL. All the experts share it: one instance, one screen.
- `hermes-heartbeat-fix.py` applies, at build time, upstream's fix for Hermes refusing every
  ordinary command from GPT models (the default model). Once `HERMES_TAG` ships a Hermes with the
  fix, the build prints "already has the fix": then remove the step from the Dockerfile.

Build and publish it in the Agent37 cloud (no local Docker needed), from this folder:

```bash
AGENT37_API_KEY=sk_live_... npx agent37 templates build . --name yelema-hermes
```

Each build publishes a new revision of the `yelema-hermes` template. New instances get it;
roll an existing one with `POST /v1/instances/{id}/update`.

Rebuild whenever `agent37-hermes` gets a new image: set `HERMES_TAG` in the Dockerfile to the
tag in `agent37-hermes`'s `image_ref` (`GET /v1/templates`) and run the build again. A stale
`yelema-hermes` misses gateway and Hermes fixes (for example the `profile` field each expert
chat relies on, gateway v0.17.0 and later).
