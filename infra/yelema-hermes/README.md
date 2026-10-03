# yelema-hermes

The Agent37 workspace template every Yelema client instance runs: the stock `agent37-hermes`
image (Hermes + the Agent37 gateway + managed model/Composio wiring) plus the PDF tools the
expert skills call.

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
