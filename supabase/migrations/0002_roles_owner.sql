-- Roles + per-user agent ownership (one client per deployment).
--
-- * Two workspace roles: 'admin' (sees and manages every agent, invites people) and 'member'
--   (creates and uses their own agent only). Invitations default to 'member'.
-- * agents.owner_user_id: the user an agent belongs to. One agent per user per workspace.
--   Rows created before this migration keep owner_user_id NULL: only admins see them.
--
-- Authorization stays in the server (src/lib/auth.ts); the RLS policies of 0001 remain a dormant
-- backstop and are not changed here.

alter table public.memberships drop constraint if exists memberships_role_check;
alter table public.memberships
  add constraint memberships_role_check check (role in ('admin', 'member'));

alter table public.invitations drop constraint if exists invitations_role_check;
alter table public.invitations
  add constraint invitations_role_check check (role in ('admin', 'member'));
alter table public.invitations alter column role set default 'member';

alter table public.agents
  add column if not exists owner_user_id uuid references auth.users (id) on delete set null;

create unique index if not exists agents_one_per_owner_idx
  on public.agents (workspace_id, owner_user_id)
  where owner_user_id is not null;

-- Accepting an invitation never downgrades: an admin who opens a member link stays admin.
create or replace function public.accept_invitation(p_token uuid, p_user uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.invitations%rowtype;
begin
  select * into v_inv from public.invitations where token = p_token;
  if not found then
    raise exception 'invitation not found';
  end if;
  if v_inv.expires_at < now() then
    raise exception 'invitation expired';
  end if;
  insert into public.memberships (workspace_id, user_id, role)
  values (v_inv.workspace_id, p_user, v_inv.role)
  on conflict (workspace_id, user_id) do update
    set role = case when memberships.role = 'admin' then 'admin' else excluded.role end;
  delete from public.invitations where token = p_token;
  return v_inv.workspace_id;
end;
$$;

grant execute on function public.accept_invitation(uuid, uuid) to service_role;
