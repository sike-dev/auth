# Hosting the accounts website

The accounts website (`web/`) is a static single-page app. Anything that can serve static files works. This guide uses **Cloudflare Pages** as the worked example and notes what changes on other hosts.

Do the Supabase setup first ([supabase.md](./supabase.md)). Keep **one deployment per Supabase project**: a dev site against the dev project, a production site against the production project.

---

## 1. What the host must do

| Requirement | Why |
|---|---|
| Serve `index.html` for every route that isn't a real file | `/oauth/consent`, `/auth/confirm`, `/reset-password` and the other pages are client-side routes. Without a fallback, opening one directly gives a 404 and **sign-in breaks for every app**. |
| Send the security headers in `web/public/_headers` | HSTS, a strict Content-Security-Policy and `frame-ancestors 'none'`. The site holds a login session in the browser, so a CSP matters. |
| Serve over HTTPS on a fixed address | The address ends up in Supabase's Site URL, email links and the OAuth consent URL. Changing it later is painful (supabase.md section 2.2). |
| Build with the right environment values | The `VITE_` values are baked into the JavaScript at build time. |

---

## 2. Build settings

| Setting | Value |
|---|---|
| Root directory | `web` |
| Build command | `npm run build` (runs the type check, then the Vite build) |
| Build output directory | `dist` |
| Node version | 20.19 or newer (Vite 8 requires it). `web/.node-version` pins `22`, which Cloudflare Pages reads. Setting `NODE_VERSION=22` in the dashboard does the same. |

### Environment variables

Production values live in **`web/.env.production`**, which is committed. `vite build` reads it automatically, so the host needs **no environment variables of its own**.

| Name | Value | Secret? |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` | No |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` | No, public by design |
| `VITE_LOGOUT_RETURN_ORIGINS` | Comma-separated https origins of your apps, e.g. `https://app.sike.dev,https://www.sike.dev`. Empty means no app may use `return_to` yet. | No |

- **Everything with a `VITE_` prefix ends up in the public JavaScript.** That is why the file may be committed, and why it must never hold the Supabase secret key, the access token or the Resend key. `src/lib/env-production.test.ts` fails if a secret-looking value or a non-`VITE_` variable is added.
- **They are read at build time.** Changing one means a new build and deploy. That includes adding an app to `VITE_LOGOUT_RETURN_ORIGINS`: edit the file, commit, push.
- Variables set in the host's dashboard override the file. Use that only for something you don't want in git.
- On your machine, `npm run build` uses `.env.production` (it wins over `.env.local`), and `npm run dev` uses `.env.local`.
- Origins only: scheme, host and port, no path. Entries that aren't valid URLs are ignored.

---

## 3. Headers and the SPA fallback

**Headers.** `web/public/_headers` is copied into `dist/` by the build and read by Cloudflare Pages. It sets:

| Header | Purpose |
|---|---|
| `Content-Security-Policy` | Only scripts, fonts and images from the site itself, and network calls only to the site and `https://*.supabase.co`. No framing, no `<object>`, forms only to itself. |
| `Strict-Transport-Security` | Browsers use HTTPS only, for a year. |
| `X-Frame-Options: DENY` | Older-browser equivalent of `frame-ancestors 'none'` (clickjacking). |
| `X-Content-Type-Options: nosniff` | No content-type guessing. |
| `Referrer-Policy: no-referrer` | Email-link and consent addresses are never sent as a referrer. |
| `Permissions-Policy` | Turns off camera, microphone, location, payment and USB. |

Things to know about the CSP:
- `style-src` includes `'unsafe-inline'` because UI libraries set inline styles. Scripts have **no** inline or `eval` allowance.
- If you move Supabase to a custom domain (supabase.md section 2.2), add that origin to `connect-src` in `_headers`.
- Anything new that loads from another origin (analytics, a CAPTCHA widget, web fonts) needs an explicit entry. CAPTCHA (Cloudflare Turnstile or hCaptcha) needs its script and frame origins added to `script-src`, `frame-src` and `connect-src`.
- Cloudflare allows 100 header rules and 2,000 characters per line. The CSP line is well under that.

**SPA fallback.** Cloudflare Pages serves `index.html` for unknown paths automatically as long as the project has **no top-level `404.html`**. Don't add one. On other hosts:

| Host | What to add |
|---|---|
| Netlify | `web/public/_redirects` containing `/*  /index.html  200`, and the headers above in `netlify.toml` or a Netlify `_headers` file |
| Vercel | a `vercel.json` with a rewrite of `/(.*)` to `/index.html`, and the headers above under `headers` |
| S3 + CloudFront | custom error responses mapping 403 and 404 to `/index.html` with status 200, and a response-headers policy |

---

## 4. Cloudflare Pages: first deploy

1. In the Cloudflare dashboard, **Workers & Pages → Create → Pages → Connect to Git**, and pick the repo.
2. Enter the build settings from section 2. No environment variables are needed, because `web/.env.production` is in the repo.
3. Deploy. You get a `https://<project>.pages.dev` address. Open it and check the site loads.
4. Add the custom domain `auth.sike.dev` under the project's **Custom domains** tab. If `sike.dev` is managed in Cloudflare DNS, the record is created for you. Otherwise add a `CNAME` record `auth` pointing to `<project>.pages.dev` at your DNS provider. The existing `mail.sike.dev` email records are unaffected.
5. Do the Supabase side (section 5 below).
6. Run the smoke test (section 6).

**Preview deployments** build with the same `.env.production`, so they point at the production Supabase project, and their `*.pages.dev` addresses aren't in Supabase's redirect allow-list (sign-up and reset emails can't work from a preview). Turn previews off for this project, or override the variables for **Preview** with a dev project's values.

---

## 5. Supabase settings that depend on the address

In the Supabase project that `web/.env.production` points at (supabase.md sections 4 and 9.1):

| Setting | Value |
|---|---|
| Authentication → URL Configuration → **Site URL** | `https://auth.sike.dev` |
| Authentication → URL Configuration → **Redirect URLs** | `https://auth.sike.dev/**`. Keep `localhost` out of a dedicated production project. |
| Authentication → OAuth Server → **Authorization path** | `/oauth/consent` |

**One project for development and production.** The Site URL is a single value, so once it is `https://auth.sike.dev`, emails sent while you develop locally also link to the live site, and local sign-up confirmations finish there. If you keep using the same project locally, also add `http://localhost:3000/**` to the Redirect URLs. This works, but test users and real users share one user table. A separate dev project (supabase.md section 2.1) avoids that; switching later only means changing the two Supabase values in `web/.env.local`.

Then re-apply the email templates so links use the new Site URL: `node --env-file=.env supabase/apply-email-config.mjs` (from the repo root, with the production project's values).

---

## 6. Smoke test after every deploy

```sh
# 1. Security headers are present
curl -sI https://auth.sike.dev/ | grep -iE 'content-security-policy|strict-transport-security|x-frame-options|x-content-type-options|referrer-policy'

# 2. Deep links work (expect 200 for each, not 404)
for p in / /login /signup /forgot-password /reset-password /auth/confirm /oauth/consent /logout; do
  printf '%s  ' "$p"; curl -s -o /dev/null -w '%{http_code}\n' "https://auth.sike.dev$p"
done
```

Then in a browser:
- [ ] Open `/login` with the developer console open. There are **no** "Refused to…" CSP errors.
- [ ] Sign in, and `/` shows your email.
- [ ] Sign out, and you land on "You're signed out".
- [ ] Open the site in a frame (a test page with an `<iframe>`). It refuses to load.
- [ ] Run [testing.md](./testing.md) once end to end after the first production deploy.

If the console shows a CSP error, the message names the blocked address and the directive. Add that origin to the matching directive in `web/public/_headers`, redeploy, and test again.

---

## 7. Updating and rolling back

- **Update:** push to the production branch. Every change to `web/` rebuilds the site.
- **Roll back:** Cloudflare Pages keeps earlier deployments. Promote a previous one from the project's **Deployments** tab. Changes in Supabase (settings, migrations) are not rolled back with it.
- **Adding an app** means a new OAuth client, a row in `private.oauth_apps`, and the app's origin added to `VITE_LOGOUT_RETURN_ORIGINS` in `web/.env.production` (commit and push to redeploy). See implementation.md section 16.
