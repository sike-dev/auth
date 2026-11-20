# Supabase Setup for Central Auth (SSO)

This guide covers everything to configure in Supabase so one Supabase project can be the **central login** for all your web and mobile applications, using **email + password** and **single sign-on**.

How applications connect to it is covered separately in [implementation.md](./implementation.md). Deploying the accounts website is in [hosting.md](./hosting.md), day-to-day tasks and secret rotation in [operations.md](./operations.md), and an end-to-end test recipe in [testing.md](./testing.md).

> **Status note.** Supabase's OAuth 2.1 server is in **beta** (free on all plans; users count toward Monthly Active Users). Dashboard menu names change from time to time. If a setting isn't where this guide says, search the dashboard for it. Verify against the official docs before going live: <https://supabase.com/docs/guides/auth/oauth-server>.

---

## 1. The big picture

```
                      ┌────────────────────────────────────────┐
                      │            Supabase project            │
                      │                                        │
                      │  Auth: users, passwords, sessions      │
                      │  OAuth 2.1 / OIDC server  (SSO)        │
                      │  Database: app registry                │
                      └───────────────▲────────────────────────┘
                                      │
                 ┌────────────────────┴──────────────────┐
                 │         Accounts website               │
                 │   auth.sike.dev                        │
                 │   sign in · sign up · reset password   │
                 │   consent · sign out · account page    │
                 └────────────────────▲──────────────────┘
                                      │ redirects (OAuth)
        ┌───────────────┬─────────────┴─────┬────────────────┐
        │  Web app A    │  iOS app A        │  Web app B ... │
        └───────────────┴───────────────────┴────────────────┘
```

| Piece | Who provides it | What it does |
|---|---|---|
| **Supabase Auth** | Supabase (configured by you) | Stores users and hashed passwords, issues and refreshes tokens, sends emails. |
| **OAuth 2.1 server** | Supabase (enabled by you) | Lets every app "Sign in with your accounts site". This is what gives you SSO. |
| **Accounts website** | **You build it** (a static React app in `web/`) | The only place users ever type a password. It holds the SSO session in the browser. |
| **Database objects** | **You create them** (SQL below) | The app registry and the token hook. |
| **Your apps** | You | Redirect to the accounts site, receive tokens, and call APIs with them. |

**How SSO works here:** the accounts website keeps a Supabase session in the browser, on its own domain. When any app sends a user to sign in, Supabase hands them to the accounts website. If that session already exists, the site approves instantly and the user goes straight back, already logged in.

**What you do NOT build:** password hashing, token signing, refresh logic, or session storage. Supabase does all of it.

---

## 2. Before you start

### 2.1 Decide your environments
Create **one Supabase project per environment**, for example `auth-dev` and `auth-prod`. Never test against production users.

Everything in this guide is done once per project. Keep the SQL in version control as migrations (Supabase CLI: `supabase migration new <name>`) so the environments stay identical.

### 2.2 Decide the accounts website address
This project uses **`https://auth.sike.dev`**. It ends up in:
- the Site URL
- email links
- the OAuth authorization URL

Changing it later is painful.

**Optional: a custom domain for Supabase itself.** This is a paid add-on, for example `https://id.sike.dev` instead of `https://<project-ref>.supabase.co`. If you want one, set it up **before** apps go live, because apps pin the issuer URL. After adding it, check the `issuer` value in the discovery document (section 13) and use exactly that value in every app.

### 2.3 Know your keys
Find them under **Project Settings → API Keys**.

| Key | Looks like | Where it may be used |
|---|---|---|
| **Publishable key** | `sb_publishable_...` | Browsers, mobile apps, the accounts site frontend. Safe to expose; protected by RLS. |
| **Secret key** | `sb_secret_...` | **Admin scripts and CI only.** Bypasses RLS. Never ship it in an app or the accounts website, never commit it. The accounts website needs no secret key at all. |

If your project still shows the legacy `anon` / `service_role` keys, they play the same roles. Prefer the new keys.

Store secrets in your hosting provider's secret manager or a git-ignored `.env`. Never keep them in plain text files.

### 2.5 Apply the migrations
`supabase/migrations/` holds the SQL for the `private` schema, the app registry and the token hook. Run it on every new project (dev first, then prod) **before** enabling the hook in section 8.

- **Simplest:** open **SQL Editor** in the dashboard and run the two files in filename order.
- **CLI:** `supabase login`, then from the repo root `supabase init` (adds `supabase/config.toml` next to the existing `migrations/` folder; it has no secrets and only configures local development), `supabase link --project-ref <project-ref>`, and `supabase db push`.

Check afterwards: `select * from private.oauth_apps;` runs without an error, and `public.custom_access_token_hook` exists.

### 2.4 Protect the Supabase account itself
- Turn on **MFA** for every person with dashboard access (Account → Security).
- Give team members the lowest organization role they need.

---

## 3. JWT signing keys (required)

Go to **Project Settings → JWT Keys** (sometimes under Authentication → Signing Keys).

1. Make sure the project uses **asymmetric signing keys** (ES256 or RS256). New projects use them by default. If yours shows a "Legacy JWT secret" (HS256) as the current key:
   - create a new asymmetric standby key
   - **rotate** to it
   - after every access token signed with the old key has expired (default 1 hour), **revoke** the legacy secret

**Why it matters:**
- **ID tokens (`openid` scope) fail with HS256.** OpenID Connect requires asymmetric keys.
- Apps and backends can verify tokens using the **public** keys at `/auth/v1/.well-known/jwks.json`, with no shared secret.
- Keys can be rotated without redeploying apps, because verifiers read the JWKS.

---

## 4. URL configuration

Go to **Authentication → URL Configuration**.

| Setting | Value | Why |
|---|---|---|
| **Site URL** | `https://auth.sike.dev` | Base for email links and for the OAuth consent URL. |
| **Redirect URLs** (allow list) | `https://auth.sike.dev/**` plus your local dev URL (e.g. `http://localhost:3000/**`) in the dev project only. If dev and production share one project, keep the localhost entry too (see hosting.md section 5). | Where Supabase may send users after email confirmation or password reset. **Only the accounts site goes here, not your apps.** Apps are registered separately as OAuth clients (section 9). |

---

## 5. Email & password settings

Go to **Authentication → Sign In / Providers** and open **Email**.

| Setting | Recommended | Notes |
|---|---|---|
| Email provider | **Enabled** | This is the email + password login. |
| Confirm email | **On** | Users must click the link before they can sign in. |
| Secure email change | **On** | A change of email must be confirmed by both the old and new addresses. |
| Minimum password length | **6** (currently set) | 6 is the lowest Supabase allows. Raise it (10+ is safer) in the dashboard **and** in `MIN_PASSWORD_LENGTH` in `web/src/lib/validation.ts`, which must match. |
| Password requirements | **None** (no uppercase, lowercase or number required) | Currently relaxed on purpose. Short passwords with no rules are easy to guess, so keep sign-in rate limits and CAPTCHA on, and turn on leaked-password protection if you upgrade. |
| Prevent use of leaked passwords | **On** (Pro plan and above) | Checks passwords against HaveIBeenPwned. |
| Allow new users to sign up | On, or off for invite-only | If off, only admins can create users. |

Also:
- **Disable every provider you don't use** (phone, magic link, social logins). Fewer doors, fewer bugs.
- **Anonymous sign-ins: off.**

**MFA (optional, recommended later):** under **Authentication → Multi-Factor**, enable TOTP. The accounts site then shows a second step after the password. Apps need no changes, because MFA happens entirely on the accounts site.

---

## 6. Email delivery and templates

### 6.1 Custom SMTP (required for production)
Supabase's built-in sender is for testing only. It is heavily rate-limited and only delivers to your organization's team members.

**This project uses Resend** (`smtp.resend.com`, port 465, user `resend`, password = a Resend API key), sending as `Sike <no-reply@mail.sike.dev>`:
- The sending domain (`mail.sike.dev`) must be **verified in Resend** (SPF, DKIM and DMARC records) or emails are rejected or land in spam.
- A "sending access" API key is enough. Keep it in `.env` as `RESEND_API_KEY` (git-ignored) and never in an app or the website.
- Apply or re-apply everything in one step (SMTP + templates), for example on the production project: `node --env-file=.env supabase/apply-email-config.mjs`. Set `SUPABASE_URL`, `SUPABASE_ACCESS_TOKEN` and `RESEND_API_KEY` for the target project first.
- Rate limits: Supabase allows one email per user per 60 seconds (`smtp_max_frequency`), and the project limit is set to 30 emails per hour. Raise it under **Authentication → Rate Limits** to match your Resend plan.
- Dashboard path if you'd rather click: **Authentication → Emails → SMTP Settings**.

### 6.2 Templates
Go to **Authentication → Emails → Templates** (editing needs custom SMTP, which this project now has).

The branded templates (black card, lime button) live in `supabase/email-templates/` as `confirmation`, `recovery` and `email_change` (`.html` + `.subject.txt`), and `apply-email-config.mjs` pushes them. Edit the files, re-run the script, done.

The accounts website's `/auth/confirm` page handles **both** link styles:

- **`token_hash` links** (what the current templates use): `{{ .SiteURL }}/auth/confirm?token_hash=…&type=signup|recovery|email_change`. The page calls `supabase.auth.verifyOtp({ token_hash, type })`, removes the token from the address bar, and continues.
- **Default Supabase links** (`{{ .ConfirmationURL }}`): land on `/auth/confirm#access_token=…&refresh_token=…&type=…`, handled the same way. Useful as a fallback.

**Links use `{{ .SiteURL }}`,** so the Site URL setting (section 4) must be the real accounts address in production, otherwise emails point at `localhost`.

**Where links land:** every emailed link opens `/auth/confirm`, which then continues to `/reset-password` (reset links) or the account page (everything else). A new user who signed up from inside an app therefore ends on the account page after confirming. The pending app sign-in request is short-lived, so they return to the app and sign in again, which is instant because of SSO.

For reference, the three links look like this:

**Confirm signup:**
```html
<h2>Confirm your Sike account</h2>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup">Confirm my email</a></p>
```

**Reset password:**
```html
<h2>Reset your password</h2>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">Choose a new password</a></p>
<p>If you didn't ask for this, ignore this email.</p>
```

**Change email address:**
```html
<h2>Confirm your new email</h2>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change">Confirm change</a></p>
```

Keep the wording plain, and never include a password in an email.

---

## 7. Accounts: email + password (no extra tables)

People sign up and sign in with their **email and password**. Supabase Auth stores both, so there are **no extra tables, triggers or server functions** for accounts. The accounts website talks to Supabase Auth directly with the publishable key:

| Action | What the accounts website calls |
|---|---|
| **Sign up** | `supabase.auth.signUp({ email, password, options: { emailRedirectTo } })` → "Check your email". |
| **Sign in** | `supabase.auth.signInWithPassword({ email, password })`. A wrong password and an unknown email give the same `invalid_credentials` error. |
| **Forgot password** | `supabase.auth.resetPasswordForEmail(email, { redirectTo })`. Supabase answers the same whether or not the address exists. |
| **Set a new password** | `supabase.auth.updateUser({ password })` while signed in from the reset link. |

**Sign-up emails and existing accounts:** with email confirmation on, signing up with an address that's already registered returns success without revealing it, so the form can't be used to find out who has an account.

**History:** an earlier version of this setup used usernames. The migration `supabase/migrations/20261121010000_remove_usernames.sql` removes the usernames tables, the sign-up trigger and the lookup functions, and updates the token hook below. For a fresh project (e.g. production), run both migrations in order; the end state has no usernames.

---

## 8. Custom access token hook (app claim + app allow-list)

This hook runs every time Supabase issues or refreshes a token. It does two jobs for tokens issued to an OAuth client:
- adds a trusted **`app`** claim: a short name for which application asked for the token, from the app registry (section 9.4)
- **blocks** tokens for unknown or disabled apps

```sql
-- 8.1 App registry: maps each OAuth client_id to an application
create table private.oauth_apps (
  client_id   text primary key,                       -- from Supabase OAuth Apps
  app         text not null check (app ~ '^[a-z0-9_]{2,40}$'),  -- e.g. 'app_a'
  platform    text not null check (platform in ('web', 'ios', 'android', 'desktop', 'server')),
  enabled     boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table private.oauth_apps enable row level security;

-- 8.2 The hook
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

-- 8.3 Only Supabase Auth may run the hook and read the registry
grant usage on schema private to supabase_auth_admin;
grant select on private.oauth_apps to supabase_auth_admin;

create policy "auth admin reads oauth apps" on private.oauth_apps
  as permissive for select to supabase_auth_admin using (true);

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
```

(The `private` schema is created by the first migration: `create schema if not exists private; revoke all on schema private from public, anon, authenticated;`)

**Enable it:** go to **Authentication → Hooks → Customize Access Token (JWT) Claims**, choose **Postgres**, then the function `public.custom_access_token_hook`, and save.

**Effects:**
- Apps read `app` straight from the token, with no extra lookups, and their backends reject tokens issued for a different app.
- Setting `enabled = false` for a client stops it from getting new tokens. Existing access tokens stay valid until they expire.

> Keep the hook fast and simple. A failing hook means **nobody can sign in**. Test it in the dev project first (section 14).

---

## 9. OAuth 2.1 server (the SSO part)

### 9.1 Enable it
Go to **Authentication → OAuth Server**:
- **Enable** the OAuth 2.1 server.
- **Authorization path:** `/oauth/consent`. Combined with the Site URL, this becomes `https://auth.sike.dev/oauth/consent`.
- **Dynamic client registration: off.** Only you should be able to create clients.

With CLI-managed local development (`supabase/config.toml`):
```toml
[auth.oauth_server]
enabled = true
authorization_url_path = "/oauth/consent"
allow_dynamic_registration = false
```

### 9.2 What the accounts site's consent page must do
Supabase redirects here with `?authorization_id=...`. The page:
1. If the user isn't signed in, sends them to `/login?next=/oauth/consent?authorization_id=...`, then comes back.
2. Calls `supabase.auth.oauth.getAuthorizationDetails(authorization_id)`.
   - If the response has no `authorization_id` but has a `redirect_url`, the user already approved this app. Redirect immediately.
3. **Auto-approves** with `supabase.auth.oauth.approveAuthorization(authorization_id)`, then redirects to the returned `redirect_url`. Every client is yours, so there's no reason to ask "Allow this app?". This is what makes SSO feel instant.
   - If you ever register a **third-party** client, show a real Approve/Deny screen for it instead.
4. On error, shows a simple error page with a link back.

### 9.3 Register one OAuth client per app, per platform, per environment
Go to **Authentication → OAuth Apps → Add a new client**.

**Naming:** `<app>-<platform>-<env>`, e.g. `app_a-web-prod`, `app_a-ios-prod`, `app_a-web-dev`.

| Platform | Client type | Token auth method | Redirect URI example |
|---|---|---|---|
| Server-rendered web app | **Confidential** | `client_secret_basic` | `https://app-a.example.com/auth/callback` |
| Single-page web app (browser only) | **Public** | `none` | `https://app-a.example.com/auth/callback` |
| iOS / Android | **Public** | `none` | `https://app-a.example.com/oauth/ios-callback` (Universal/App Link) or `com.example.appa:/oauth/callback` (custom scheme) |
| Local development | Public or confidential, **dev project only** | as above | `http://localhost:5173/auth/callback` |

**Rules:**
- **Redirect URIs must match exactly.** No wildcards: protocol, host, port and path all count. Register every variant you use.
- **Mobile and browser-only apps are always public.** A secret inside an app binary or a JavaScript bundle is not secret.
- **A confidential client's secret is shown only once.** Put it straight into the web app's server-side secret store.
- **Never reuse a client** across environments or platforms. Separate clients let you disable or rotate one without touching the rest.

Clients can also be created with a script (use the secret key; run it from your machine or CI, never from an app):

```bash
curl -X POST "https://<project-ref>.supabase.co/auth/v1/admin/oauth/clients" \
  -H "Authorization: Bearer ${SUPABASE_SECRET_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "app_a-ios-prod",
    "redirect_uris": ["com.example.appa:/oauth/callback"],
    "client_type": "public"
  }'
```

### 9.4 Add every client to the app registry
**Required,** or the hook in section 8 blocks it:

```sql
insert into private.oauth_apps (client_id, app, platform) values
  ('<client-id-from-dashboard>', 'app_a', 'web'),
  ('<client-id-from-dashboard>', 'app_a', 'ios');
```

All clients of the same application share the same `app` value. That is how the web and mobile versions of one app see the same data.

---

## 10. Data access and Row Level Security

**Important:** an OAuth access token has the **same power as the user's own session**. Scopes (`openid email profile phone`) only control what ID tokens and `/userinfo` reveal. **They do not restrict database access.** Supabase doesn't support custom scopes yet.

So if your apps store data in **this** Supabase project, RLS must separate applications. Otherwise one app's token could read another app's tables.

**Tokens can do more than read tables.** The access token *is* the user's session, so besides your tables it can call Supabase's own user endpoint (`/auth/v1/user`) as that user. Assume it can read the profile and may be able to change the email or password, depending on your Auth settings. Apps here are first-party and trusted, so this is accepted, but never register a client for an app you don't control. [testing.md](./testing.md) has a step that shows what your project allows.

**Recommended layout:** one schema per application, and every policy checks both the user and the `app` claim.

```sql
create schema app_a;
grant usage on schema app_a to authenticated;

create table app_a.items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title      text not null,
  created_at timestamptz not null default now()
);
alter table app_a.items enable row level security;
grant select, insert, update, delete on app_a.items to authenticated;

create policy "owner, from app_a only" on app_a.items
  for all to authenticated
  using      (user_id = (select auth.uid()) and (select auth.jwt() ->> 'app') = 'app_a')
  with check (user_id = (select auth.uid()) and (select auth.jwt() ->> 'app') = 'app_a');

create index on app_a.items (user_id);
```

Then add `app_a` under **Project Settings → Data API → Exposed schemas**. Never expose `private`.

**Rules of thumb:**
- **Every table gets RLS enabled.** No exceptions.
- **The accounts site's own session has no `app` claim,** so these policies deny it automatically. That's intended.
- **Data shared between apps** (e.g. a profile picture): put it in a `shared` schema whose policies check only `auth.uid()`.
- **Apps with their own backend and database** can skip this section. Their backend verifies tokens (see implementation.md) and stores `sub` as the user id.

---

## 11. Sessions, tokens and sign-out

### 11.1 Token lifetimes
Go to **Project Settings → JWT Keys → Access token expiry** (or Authentication → Sessions).

| Setting | Recommended | Trade-off |
|---|---|---|
| Access token expiry | **900–3600 s** (15–60 min) | Shorter means sign-out and app disabling take effect sooner, but apps refresh more often. Don't go below 300 s. |
| Detect and revoke compromised refresh tokens | **On** | Refresh tokens are single-use (rotated). Reusing an old one revokes the session. |
| Refresh token reuse interval | **10 s** (default) | Tolerates two parallel refreshes. |

### 11.2 Session limits (Pro plan and above)
Go to **Authentication → Sessions**:
- **Time-box user sessions:** e.g. 30 days. After that, everyone signs in again.
- **Inactivity timeout:** e.g. 14 days.
- **Single session per user:** usually **off**, because users have several devices.

These limits also govern how long the SSO session on the accounts site lasts.

### 11.3 Sign-out
- **Local sign-out** in an app just deletes that app's tokens.
- **"Sign out everywhere"** happens on the accounts site, by calling `supabase.auth.signOut({ scope: 'global' })`. That revokes all of the user's refresh tokens, including the apps' tokens (verified on this project on 2026-11-21), so other apps lose access by the time their current access token expires.
- **Revoking one app:** `supabase.auth.oauth.revokeGrant(clientId)` deletes that app's refresh tokens for the user. Show this on an "Apps with access" page using `supabase.auth.oauth.getUserGrants()`.
- **Banning a user:** use **Authentication → Users → ⋯ → Ban user**, or `auth.admin.updateUserById(id, { ban_duration: '876000h' })`. They can no longer sign in or refresh.

---

## 12. Abuse protection

Go to **Authentication → Attack Protection** and **Authentication → Rate Limits**.

| Protection | What to do |
|---|---|
| **CAPTCHA** | Enable Cloudflare Turnstile or hCaptcha. The accounts site passes the token as `options.captchaToken` on `signUp`, `signInWithPassword` and `resetPasswordForEmail`. |
| **Supabase rate limits** | Keep the defaults for sign-in and verification. Set email-sending limits to fit your SMTP plan. |
| **Your own rate limits** | Supabase already rate-limits sign-in, sign-up and email sending per IP. Because the accounts website is a static app, put any extra limiting (e.g. 5 attempts per minute per IP) at the CDN or WAF in front of it. |
| **Generic errors** | Never reveal whether an email has an account: keep "Email or password is incorrect" for sign-in, and the same "Check your email" screen for sign-up and password reset (section 7). |
| **Security headers** | `web/public/_headers` sets HSTS, a strict Content-Security-Policy and `frame-ancestors 'none'` (so the site can't be embedded) when deployed on Cloudflare Pages. Other hosts need the same headers set in their own format. See [hosting.md](./hosting.md), and check them after every deploy. |

---

## 13. Reference: endpoints your apps will use

Replace `<project-ref>`, or use your custom domain if you set one up.

| Purpose | URL |
|---|---|
| Issuer | `https://<project-ref>.supabase.co/auth/v1` |
| OIDC discovery | `https://<project-ref>.supabase.co/auth/v1/.well-known/openid-configuration` |
| Authorize | `https://<project-ref>.supabase.co/auth/v1/oauth/authorize` |
| Token (code exchange and refresh) | `https://<project-ref>.supabase.co/auth/v1/oauth/token` |
| UserInfo | `https://<project-ref>.supabase.co/auth/v1/oauth/userinfo` |
| JWKS (public keys) | `https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json` |

Supported:
- **Grant types:** `authorization_code` (with PKCE) and `refresh_token`. The password grant and client credentials are **not** supported, so apps must use the redirect flow.
- **Scopes:** `openid`, `email`, `profile`, `phone`. The default is `email`. (The discovery document also lists `offline_access`; Supabase's docs don't describe it, so don't rely on it.)

Open the discovery URL in a browser once and check the `issuer` value.

**Checked on this project on 2026-11-21:** the discovery document lists no `end_session_endpoint` and no `revocation_endpoint`. Signing out everywhere therefore goes through the accounts site (`/logout?scope=global`). Look again from time to time; Supabase may add them.

---

## 14. Test checklist (dev project)

Run through all of these before production:

- [ ] Sign up with a new email: confirmation email arrives and the link signs the user in.
- [ ] Sign up with a too-short password or an invalid email: friendly error, no user created.
- [ ] Sign in with the right email and password works. A wrong password and an unknown email show the **same** message.
- [ ] Forgot password: email arrives, link opens the accounts site, new password works, old one doesn't.
- [ ] App A (web) sign-in: redirect, accounts site, back with tokens. The token contains `app`, `client_id`, `email`, and `aud = authenticated`.
- [ ] Then App B (web) sign-in: **no password prompt** (SSO works).
- [ ] Mobile app sign-in: the system browser sheet appears and closes quickly when already signed in on the accounts site.
- [ ] Token refresh works, and a reused old refresh token is rejected.
- [ ] Set `enabled = false` on a client in `private.oauth_apps`: that client's next refresh fails with 403.
- [ ] "Sign out everywhere": every app is forced to sign in again within one access-token lifetime.
- [ ] RLS: a token from App A can't read App B's tables. Test with the dashboard's RLS tester or real tokens.
- [ ] Ban a test user: sign-in and refresh both fail.
- [ ] Delete a test user: their app data is removed (`on delete cascade`).
- [ ] Break the hook on purpose in dev and confirm you see it in **Logs → Auth**, so you know how failures look.

---

## 15. Production checklist

- [ ] Separate production project, with all migrations applied.
- [ ] Asymmetric signing keys active, legacy secret revoked.
- [ ] Site URL and redirect URL allow list contain only production accounts-site URLs.
- [ ] Custom SMTP with SPF, DKIM and DMARC; email links land on the accounts site's `/auth/confirm`.
- [ ] Password policy decided on purpose: currently min 6, no character rules. Consider a higher minimum and leaked-password protection (Pro) before launch.
- [ ] Unused providers disabled, anonymous sign-in off.
- [ ] OAuth server enabled, dynamic registration off, consent path set.
- [ ] One OAuth client per app/platform with exact production redirect URIs, each in `private.oauth_apps`.
- [ ] Access token hook enabled and tested.
- [ ] Accounts site deployed with the security headers from `web/public/_headers` (verify with the smoke test in hosting.md) and with a fallback to `index.html` for every route.
- [ ] CAPTCHA and rate limits on.
- [ ] RLS enabled on every exposed table; `private` not exposed.
- [ ] Secret key stored only in your admin tooling or CI secrets. It's not in the accounts website or any app.
- [ ] Dashboard MFA for every team member.
- [ ] Backups / Point-in-Time Recovery appropriate for your plan. The user table is now critical for every app.
