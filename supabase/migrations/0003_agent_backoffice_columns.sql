-- Columns the back office fills on each agents row. Additive and idempotent: the shared project
-- may already hold them.
--
-- * profiles: the Hermes profiles installed on the member's instance (client__expert). The app
--   lists the member's experts from it instead of asking the instance on every page.
-- * ready: true once those profiles are usable.
-- * apps_token_hash: SHA-256 of the instance's token for the app's tool proxy
--   (/api/composio-mcp). The token itself lives only on the instance.

alter table public.agents add column if not exists profiles text[] not null default '{}';
alter table public.agents add column if not exists ready boolean not null default false;
alter table public.agents add column if not exists apps_token_hash text unique;
