# Operations runbook

Routine tasks and what to do when something goes wrong. Commands assume the repo root and a git-ignored `.env` for the project you're working on (copy `.env.example`).

---

## 1. Rotating secrets

Rotate immediately if a secret was pasted somewhere it shouldn't be, shown in a log or screen share, or committed. Rewriting git history doesn't un-leak it: rotate first, clean up after.

| Secret | Where it lives | How to rotate |
|---|---|---|
| **Supabase secret key** (`sb_secret_…`) | `.env`, CI | Project Settings → API Keys: create a new secret key, switch your scripts and CI to it, then delete the old one. |
| **Supabase access token** (`sbp_…`) | `.env` | Supabase dashboard → Account → Access Tokens: create a new token, update `.env`, revoke the old one. |
| **Resend API key** (`re_…`) | `.env`, **and inside Supabase** (stored as the SMTP password) | Create a new key in Resend, update `.env`, run `node --env-file=.env supabase/apply-email-config.mjs`, send a test sign-up, then delete the old key. Skipping the script leaves Supabase using the old key. |
| **JWT signing key** | Supabase | Rotate to a new asymmetric key as in supabase.md section 3. Apps read the public keys from the JWKS address, so they need no change. |
| **OAuth client secret** (confidential clients only) | The app's server-side secret store | Regenerate it on Authentication → OAuth Apps, update the app, redeploy it. |

The **publishable key** and project URL are public by design and don't need rotating.

Nothing in this repo should contain a real secret. Before a push, run `git diff --cached` and check that no `.env` file other than `.env.example` is staged.

---

## 2. Everyday tasks

| Task | How |
|---|---|
| **Add an app** | implementation.md section 16. |
| **Disable an app** | `update private.oauth_apps set enabled = false where app = 'app_a';` It gets no new tokens. Access tokens already issued work until they expire. |
| **Re-enable an app** | Same statement with `enabled = true`. |
| **Ban a user** | Authentication → Users → ⋯ → Ban user. They can't sign in or refresh. |
| **Sign a user out everywhere** | The user opens `/logout?scope=global` on the accounts site. |
| **Cut a user off right now** | Ban them (above). Refreshing fails immediately, though access tokens already issued work until they expire. Unbanning restores their sessions; it doesn't revoke them. |
| **Change the password rules** | Change the minimum in the dashboard and `MIN_PASSWORD_LENGTH` in `web/src/lib/validation.ts` (the error message follows it), then redeploy. |
| **Change email wording or look** | Edit `supabase/email-templates/`, then re-run `apply-email-config.mjs`. |
| **Raise email limits** | Authentication → Rate Limits, to match your Resend plan. |
| **Change the logout allow-list** | Edit `VITE_LOGOUT_RETURN_ORIGINS` in `web/.env.production`, commit and push. The host rebuilds. |

---

## 3. When something breaks

**Nobody can sign in, or every app gets an error from the token endpoint.**
1. Dashboard → Logs → Auth. A failing token hook is reported there.
2. The usual causes: the hook function was dropped or edited, `private.oauth_apps` is unreadable by `supabase_auth_admin` (check the grants in migration 1), or the client isn't in `private.oauth_apps`.
3. To restore sign-in quickly, turn the hook off under Authentication → Hooks. Tokens then have no `app` claim, so apps that check it will reject them. Fix the hook and turn it back on.

**One app gets "This application is not allowed to sign in."**
Its client ID is missing from `private.oauth_apps`, or `enabled` is false.

**A link in an email goes to `localhost` or the wrong site.**
The Site URL is wrong. Fix it under Authentication → URL Configuration and re-apply the templates.

**Emails don't arrive.**
Check Resend's logs for the message, then the sending domain's SPF, DKIM and DMARC records. Check Supabase's email rate limits. If you rotated the Resend key, re-run `apply-email-config.mjs`.

**A deep link such as `/oauth/consent?...` shows 404.**
The host isn't falling back to `index.html`. See hosting.md section 3.

**The browser console shows "Refused to…".**
A CSP directive blocks something. See hosting.md section 6.

**"Sign out everywhere" didn't log an app out immediately.**
Expected. The app's current access token works until it expires (15–60 minutes, supabase.md section 11.1). Its next refresh fails.

---

## 4. Backups and environments

- Keep separate dev and production projects. Run a risky change in dev first.
- Backups depend on your Supabase plan. The user table is critical for every app, so choose the plan with that in mind (supabase.md section 15).
- Keep migrations in `supabase/migrations/` as the only way schema changes happen, so a new environment can be rebuilt from the repo.
