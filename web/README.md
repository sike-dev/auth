# Sike accounts website

The central sign-in page for every Sike app (React + Vite + Tailwind v4 + shadcn/ui). Email + password, with single sign-on through Supabase's OAuth 2.1 server. See `../docs/supabase.md` for the Supabase side and `../docs/implementation.md` for how apps connect.

## Run

```sh
cp .env.example .env.local   # then fill in the two public values
npm install
npm run dev                  # http://localhost:3000 (add http://localhost:3000/** to Supabase's Redirect URLs)
```

| File | Used by | Tracked in git? |
|---|---|---|
| `.env.local` | `npm run dev` | No |
| `.env.production` | `npm run build` and the live site (`https://auth.sike.dev`) | **Yes**, public values only (a test guards this) |

All of them hold **public** values only: the project URL, the publishable key and the logout allow-list. This app never needs the Supabase secret key.

Other scripts: `npm test` (unit tests), `npm run typecheck`, `npm run build`, `npm run lint`.

## Routes

| Path | Purpose |
|---|---|
| `/login`, `/signup` | One page with *Sign in* / *Create account* tabs |
| `/forgot-password`, `/check-email` | Request a reset link; "check your email" screen |
| `/auth/confirm` | Landing page for every emailed link (confirm email, reset password) |
| `/reset-password` | Choose a new password after opening the reset link |
| `/oauth/consent` | Where Supabase sends apps signing in. Auto-approves (all clients are first-party) and returns the user to the app |
| `/logout` | `?scope=global` signs out of every app; `?return_to=` goes back to an allow-listed app (`VITE_LOGOUT_RETURN_ORIGINS`) |
| `/` | Signed-in account page: your email and the sign-out buttons. Profile editing, change password and "apps with access" aren't built yet. |

## Before production

Follow `../docs/hosting.md`. In short:

- Production values are in `.env.production`. They are read at build time, so changing one means redeploying. Add your apps' https origins to `VITE_LOGOUT_RETURN_ORIGINS` there.
- In Supabase, set the Site URL to `https://auth.sike.dev` and the redirect allow list to match (`../docs/hosting.md` section 5).
- Security headers (HSTS, CSP, `frame-ancestors 'none'`) are in `public/_headers`, which Cloudflare Pages applies. On Vercel (what production uses today) `vercel.json` carries the same headers and the `index.html` fallback. On another host, set them its own way.
- Host as a static site with a fallback to `index.html` for client-side routes. Cloudflare Pages does this on its own unless the project has a `404.html`; Vercel needs the rewrite in `vercel.json`.
- Email is sent through Resend from `no-reply@mail.sike.dev`. For a production project run `node --env-file=.env supabase/apply-email-config.mjs` from the repo root (see `../docs/supabase.md` section 6). Email links use Supabase's Site URL, so set it to the real address.
- After the first deploy, run the smoke test in `../docs/hosting.md` and the recipe in `../docs/testing.md`.
