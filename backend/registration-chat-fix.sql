-- Backend patch for registration and public chat (2026-10).
-- Run AFTER supabase.sql in Supabase SQL Editor. Idempotent.
-- Existing data is preserved.

alter table public.messages
  add column if not exists reply_to bigint references public.messages(id) on delete set null;

create index if not exists messages_reply_to_idx on public.messages(reply_to);

create table if not exists public.message_reactions (
  message_id bigint not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id,user_id,emoji)
);
alter table public.message_reactions enable row level security;
drop policy if exists "reactions readable" on public.message_reactions;
drop policy if exists "own reaction insert" on public.message_reactions;
drop policy if exists "own reaction delete" on public.message_reactions;
create policy "reactions readable" on public.message_reactions for select using (true);
create policy "own reaction insert" on public.message_reactions for insert to authenticated
  with check (user_id=auth.uid());
create policy "own reaction delete" on public.message_reactions for delete to authenticated
  using (user_id=auth.uid());

-- Repair the current user's profile if an earlier signup lacked a trigger.
-- SECURITY DEFINER uses auth.uid() and never accepts another user's id.
create or replace function public.ensure_my_profile()
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  wanted text;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select nullif(trim(raw_user_meta_data->>'nickname'),'')
    into wanted from auth.users where id=uid;
  if wanted is null or char_length(wanted)<3 then
    wanted := 'Участник_' || substr(uid::text,1,8);
  end if;
  if exists(select 1 from public.profiles where lower(nickname)=lower(wanted) and id<>uid) then
    wanted := left(wanted,15)||'_'||substr(uid::text,1,8);
  end if;
  insert into public.profiles(id,nickname) values(uid,left(wanted,24))
  on conflict (id) do nothing;
end;
$$;
revoke all on function public.ensure_my_profile() from public, anon;
grant execute on function public.ensure_my_profile() to authenticated;

-- Restrict updating nickname and profile fields to their owner (existing policy).
-- Do not expose service_role or elevated keys in the frontend.
