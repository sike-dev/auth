# Sike central auth

One sign-in for every Sike app: an accounts website on top of Supabase Auth and its OAuth 2.1 server.

| Folder | What's in it |
|---|---|
| `web/` | The accounts website (React + Vite). Sign up, sign in, password reset, SSO consent, sign out, account page. See `web/README.md`. |
| `supabase/` | SQL migrations, branded email templates, and the script that applies email settings. |
| `docs/` | `supabase.md`: configuring Supabase. `implementation.md`: how an app signs users in and verifies tokens. |

## Secrets

- `.env` (admin values) and `web/.env.local` are git-ignored. Copy `.env.example` and `web/.env.example` to create them.
- The Supabase secret key, access token and Resend key stay in `.env` or your CI secret store. Never in `web/`, an app, or a commit.
- The Supabase URL and publishable key are public by design; they still belong in env files, not in code.
