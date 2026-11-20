-- Central auth: usernames, app registry, and access token hook.
-- See supabase.md sections 7 and 8.

-- Private schema, not exposed through the Data API
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Usernames: one per user, stored lowercase
create table private.usernames (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  username   text not null unique
             check (username ~ '^[a-z0-9_]{3,30}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table private.usernames enable row level security;

create table private.reserved_usernames (
  username text primary key
);
insert into private.reserved_usernames (username) values
  ('admin'), ('administrator'), ('root'), ('support'), ('help'),
  ('security'), ('system'), ('accounts'), ('api'), ('www'), ('null');
alter table private.reserved_usernames enable row level security;

-- App registry: maps each OAuth client_id to an application
create table private.oauth_apps (
  client_id   text primary key,
  app         text not null check (app ~ '^[a-z0-9_]{2,40}$'),
  platform    text not null check (platform in ('web', 'ios', 'android', 'desktop', 'server')),
  enabled     boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table private.oauth_apps enable row level security;

-- Sign-up: the accounts site passes signUp({ options: { data: { username } } }).
-- An invalid, reserved or taken name makes the whole sign-up fail atomically.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text := lower(trim(new.raw_user_meta_data ->> 'username'));
begin
  if v_username is null or v_username !~ '^[a-z0-9_]{3,30}$' then
    raise exception 'invalid_username';
  end if;

  if exists (select 1 from private.reserved_usernames r where r.username = v_username) then
    raise exception 'username_reserved';
  end if;

  insert into private.usernames (user_id, username) values (new.id, v_username);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Server-only helpers (secret key). They return emails, so never grant to anon/authenticated.
create or replace function public.email_for_username(p_username text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.email
  from private.usernames n
  join auth.users u on u.id = n.user_id
  where n.username = lower(trim(p_username))
    and u.deleted_at is null;
$$;

create or replace function public.username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select lower(trim(p_username)) ~ '^[a-z0-9_]{3,30}$'
     and not exists (select 1 from private.usernames where username = lower(trim(p_username)))
     and not exists (select 1 from private.reserved_usernames where username = lower(trim(p_username)));
$$;

create or replace function public.change_username(p_user_id uuid, p_new text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new text := lower(trim(p_new));
begin
  if v_new !~ '^[a-z0-9_]{3,30}$' then raise exception 'invalid_username'; end if;
  if exists (select 1 from private.reserved_usernames where username = v_new) then
    raise exception 'username_reserved';
  end if;
  update private.usernames set username = v_new, updated_at = now() where user_id = p_user_id;
end;
$$;

revoke execute on function public.email_for_username(text) from public, anon, authenticated;
revoke execute on function public.username_available(text) from public, anon, authenticated;
revoke execute on function public.change_username(uuid, text) from public, anon, authenticated;
grant execute on function public.email_for_username(text) to service_role;
grant execute on function public.username_available(text) to service_role;
grant execute on function public.change_username(uuid, text) to service_role;

-- Access token hook: adds trusted `username` and `app` claims and blocks unknown or disabled apps.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims      jsonb := event -> 'claims';
  v_client_id text  := event -> 'claims' ->> 'client_id';
  v_username  text;
  v_app       text;
  v_enabled   boolean;
begin
  select username into v_username
  from private.usernames
  where user_id = (event ->> 'user_id')::uuid;

  claims := jsonb_set(claims, '{username}', coalesce(to_jsonb(v_username), 'null'::jsonb));

  -- Tokens without client_id belong to the accounts site's own session.
  if v_client_id is not null then
    select app, enabled into v_app, v_enabled
    from private.oauth_apps
    where client_id = v_client_id;

    if v_app is null or v_enabled is not true then
      return jsonb_build_object(
        'error', jsonb_build_object(
          'http_code', 403,
          'message', 'This application is not allowed to sign in.'
        )
      );
    end if;

    claims := jsonb_set(claims, '{app}', to_jsonb(v_app));
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

grant usage on schema private to supabase_auth_admin;
grant select on private.usernames, private.oauth_apps to supabase_auth_admin;

create policy "auth admin reads usernames" on private.usernames
  as permissive for select to supabase_auth_admin using (true);
create policy "auth admin reads oauth apps" on private.oauth_apps
  as permissive for select to supabase_auth_admin using (true);

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
