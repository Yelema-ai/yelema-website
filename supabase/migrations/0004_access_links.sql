-- Access links (src/lib/access-links.ts) reuse the invitations table: a row now names the email
-- it signs in, and is consumed once from the /acces page.
alter table public.invitations add column if not exists email text;
alter table public.invitations alter column role set default 'admin';

-- The first workspace an email belongs to, for "Mot de passe oublié" (server-only).
create or replace function public.find_user_workspace(p_email text)
returns table (workspace_id uuid)
language sql
security definer
set search_path = public
as $$
  select m.workspace_id
  from public.memberships m
  join auth.users u on u.id = m.user_id
  where lower(u.email) = lower(p_email)
  order by m.created_at
  limit 1;
$$;

revoke all on function public.find_user_workspace(text) from public, anon, authenticated;
grant execute on function public.find_user_workspace(text) to service_role;
