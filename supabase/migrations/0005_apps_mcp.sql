-- Yelema's own Composio: each instance's experts reach it through the app's /api/composio-mcp
-- proxy with a per-instance token. Only the token's SHA-256 is stored here; the token itself lives
-- in the instance (~/.yelema/apps-mcp.json), written by provisioning.
alter table public.agents add column if not exists apps_token_hash text unique;
