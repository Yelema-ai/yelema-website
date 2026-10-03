-- Yelema: one Agent37 instance per workspace, holding the 11 expert Hermes profiles.
--
-- * workspaces.logo_url: the client's logo, shown in the sidebar (written by the back office).
-- * The workspace's instance is the agents row with owner_user_id NULL (at most one per
--   workspace). The back office writes `profiles` (installed Hermes profiles) and flips `ready`
--   once they are installed; until then the app shows "Votre équipe s'installe".

alter table public.workspaces add column if not exists logo_url text;

alter table public.agents add column if not exists profiles text[] not null default '{}';
alter table public.agents add column if not exists ready boolean not null default false;

create unique index if not exists agents_one_workspace_agent_idx
  on public.agents (workspace_id)
  where owner_user_id is null;
