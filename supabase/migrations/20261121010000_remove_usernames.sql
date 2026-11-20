-- Email + password only: remove usernames.
-- Order matters: replace the hook first so token issuance never reads a dropped table,
-- and drop the sign-up trigger so sign-ups without a username are accepted.

-- Hook: adds the trusted `app` claim and blocks unknown or disabled apps.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims      jsonb := event -> 'claims';
  v_client_id text  := event -> 'claims' ->> 'client_id';
  v_app       text;
  v_enabled   boolean;
begin
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

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists private.handle_new_user();
drop function if exists public.email_for_username(text);
drop function if exists public.username_available(text);
drop function if exists public.change_username(uuid, text);
drop table if exists private.usernames;
drop table if exists private.reserved_usernames;
