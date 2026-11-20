# Integrating an Application with Central Auth

This guide explains how any web or mobile application signs users in through the central accounts website, and how its backend trusts those users. It's written to apply to every application you build.

Supabase-side setup (keys, OAuth server, client registration) is covered in [supabase.md](./supabase.md). Complete that first.

---

## 1. Concepts in one page

| Term | Meaning |
|---|---|
| **Accounts website** | `https://accounts.example.com`. The **only** place a user types an email and password. Apps never see passwords. |
| **Issuer** | `https://<project-ref>.supabase.co/auth/v1`. The Supabase Auth server that issues tokens. Every library needs this one value; everything else is discovered from it. |
| **OAuth client** | Your app's registration in Supabase. Each app has one per platform and environment, and each has a **client ID** (and a secret, for server-side web apps only). |
| **Redirect URI** | The exact URL in your app where users land after signing in. It must match the registration character for character. |
| **Authorization code + PKCE** | The sign-in flow. The app redirects to the issuer, the user signs in on the accounts site, and the app gets a one-time **code** that it swaps for tokens. PKCE (a random secret generated per login) stops stolen codes from being used. |
| **Access token** | A short-lived JWT (minutes to an hour). Sent to your APIs as `Authorization: Bearer <token>`. |
| **Refresh token** | A long-lived, **single-use** token for getting new access tokens without a new login. Each refresh returns a new one, so always save the latest. |
| **ID token** | A JWT describing who signed in. It's for the app's UI only; never send it to APIs. Requires the `openid` scope. |

### Why the user only signs in once
The accounts site keeps its own session in the browser, in storage that belongs to its domain (not a cookie). When a second app redirects there, that session is already present, so the site approves immediately and sends the user straight back. The only requirement on the app side is to use a **real browser** (the system browser on mobile), so the same browser storage is shared.

### What's inside an access token
```json
{
  "iss": "https://<project-ref>.supabase.co/auth/v1",
  "aud": "authenticated",
  "sub": "8ccaa7af-909f-44e7-84cb-67cdccb56be6",
  "exp": 1735819200,
  "iat": 1735815600,
  "role": "authenticated",
  "session_id": "…",
  "client_id": "…",
  "app": "app_a",
  "email": "jane@example.com",
  "aal": "aal1"
}
```

| Claim | Use it for |
|---|---|
| `sub` | **The user's permanent ID.** Use it as the foreign key in your own tables. Never use the email as an ID; it can change. |
| `email` | Display only. Verified by Supabase; can change, so don't use it as a key. |
| `app` | Which application the token was issued for. Backends should reject tokens meant for a different app. |
| `client_id` | The exact client (app + platform) that obtained it. |
| `user_metadata` | **Never trust it** for anything important; users can edit it. |

---

## 2. What you need before writing code

For each app, collect these from the Supabase setup:

| Value | Example | Secret? |
|---|---|---|
| Issuer | `https://<project-ref>.supabase.co/auth/v1` | No |
| Client ID (per platform) | `9a8b7c6d-…` | No |
| Client secret (server-rendered web only) | `…` | **Yes**: server-side secret store only |
| Redirect URI (per platform) | `https://app-a.example.com/auth/callback` | No |
| Scopes | `openid email profile` | No |
| Accounts site URL | `https://accounts.example.com` | No |
| App name (the `app` claim) | `app_a` | No |
| Supabase publishable key (only if the app reads the Supabase database directly) | `sb_publishable_…` | No |

Keep these in per-environment configuration (dev and prod), never hard-coded.

**Do not** put the Supabase **secret key** in any app.

---

## 3. The sign-in flow

```
 App                     Supabase Auth                 Accounts website
  │ 1. create state, nonce, PKCE verifier + challenge
  │ 2. open /oauth/authorize?...  ────►│
  │                                    │ 3. validate client + redirect URI
  │                                    │──── redirect ──────────────►│ /oauth/consent?authorization_id=…
  │                                    │                             │ 4. signed in? if not → login page
  │                                    │                             │    (already signed in = SSO, no prompt)
  │                                    │◄─── approveAuthorization ───│ 5. auto-approve
  │◄──── redirect to redirect_uri?code=…&state=… ────────────────────│
  │ 6. check state
  │ 7. POST /oauth/token (code + verifier) ─►│
  │◄──────── access, refresh, id tokens ─────│
  │ 8. store tokens securely, show the user as signed in
```

The authorization request your library builds:
```
GET https://<project-ref>.supabase.co/auth/v1/oauth/authorize
    ?response_type=code
    &client_id=<client-id>
    &redirect_uri=<exact-registered-uri>
    &scope=openid%20email%20profile
    &state=<random>
    &nonce=<random>
    &code_challenge=<base64url(sha256(verifier))>
    &code_challenge_method=S256
```

**Rules every integration must follow:**
1. **Always use PKCE with `S256`.**
2. **Always send and check `state`.** Reject the callback if it doesn't match what you stored.
3. **Always send and check `nonce`** when using ID tokens.
4. **Use the exact registered redirect URI.**
5. **Exchange the code once, within 10 minutes.** Codes are single-use.
6. **Use a well-known OAuth/OIDC library.** Don't hand-roll the flow.

---

## 4. Choosing the integration style

| App type | Client type | Where tokens live | Recommended library |
|---|---|---|---|
| **Server-rendered web app** (has its own server: Next.js, Remix, Django, Rails, FastAPI + templates, …) | Confidential | On the server; the browser gets only an HttpOnly session cookie | `openid-client` (Node), `Authlib` (Python), or your framework's OIDC plugin |
| **Single-page web app** (static files only) | Public | Browser memory, plus refresh token storage | `oidc-client-ts` |
| **iOS** | Public | Keychain | AppAuth-iOS, or `ASWebAuthenticationSession` with a small OAuth helper |
| **Android** | Public | Encrypted storage backed by Android Keystore | AppAuth-Android |

**For web, prefer the server-rendered style** (often called "backend for frontend"). Tokens never touch browser JavaScript, so a script injection bug can't steal them.

---

## 5. Web: server-rendered app (confidential client)

The pattern:
- `/login` starts the flow.
- `/auth/callback` finishes it.
- The server keeps tokens in a server-side session.
- The browser holds only an HttpOnly, Secure, SameSite=Lax cookie with a session ID.

Example with Node and `openid-client` (v6). Adapt it to your framework.

```ts
import * as oidc from 'openid-client'

const config = await oidc.discovery(
  new URL(process.env.AUTH_ISSUER!),          // https://<project-ref>.supabase.co/auth/v1
  process.env.AUTH_CLIENT_ID!,
  process.env.AUTH_CLIENT_SECRET!,            // confidential client only
)

// GET /login
export async function login(req, res) {
  const codeVerifier = oidc.randomPKCECodeVerifier()
  const state = oidc.randomState()
  const nonce = oidc.randomNonce()

  req.session.oauth = { codeVerifier, state, nonce, returnTo: safeReturnTo(req.query.returnTo) }

  const url = oidc.buildAuthorizationUrl(config, {
    redirect_uri: process.env.AUTH_REDIRECT_URI!,
    scope: 'openid email profile',
    code_challenge: await oidc.calculatePKCECodeChallenge(codeVerifier),
    code_challenge_method: 'S256',
    state,
    nonce,
  })
  res.redirect(url.href)
}

// GET /auth/callback
export async function callback(req, res) {
  const pending = req.session.oauth
  if (!pending) return res.redirect('/login')

  const currentUrl = new URL(req.originalUrl, process.env.APP_BASE_URL)
  if (currentUrl.searchParams.get('error')) return res.redirect('/signed-out?reason=denied')

  const tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
    pkceCodeVerifier: pending.codeVerifier,
    expectedState: pending.state,
    expectedNonce: pending.nonce,
  })

  req.session.regenerate(() => {               // prevents session fixation
    req.session.tokens = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    }
    req.session.user = tokens.claims()        // sub, email, name… from the ID token
    res.redirect(pending.returnTo ?? '/')
  })
}

// Use before calling APIs
export async function getAccessToken(req) {
  const t = req.session.tokens
  if (!t) return null
  if (Date.now() < t.expires_at - 60_000) return t.access_token

  const refreshed = await oidc.refreshTokenGrant(config, t.refresh_token)
  req.session.tokens = {
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token ?? t.refresh_token,   // rotated: keep the newest
    expires_at: Date.now() + (refreshed.expires_in ?? 3600) * 1000,
  }
  return refreshed.access_token
}
```

**Notes:**
- `safeReturnTo` must only allow **relative paths in your own app**, to prevent open redirects.
- Store sessions server-side (Redis or a database), not in a cookie, because refresh tokens are long-lived secrets.
- If two requests refresh at the same time, Supabase tolerates it for about 10 seconds (the reuse interval). A per-session lock is still better.

---

## 6. Web: single-page app (public client)

Only use this style when the app has no server of its own.

```ts
import { UserManager, WebStorageStateStore } from 'oidc-client-ts'

export const auth = new UserManager({
  authority: import.meta.env.VITE_AUTH_ISSUER,          // https://<project-ref>.supabase.co/auth/v1
  client_id: import.meta.env.VITE_AUTH_CLIENT_ID,
  redirect_uri: `${location.origin}/auth/callback`,
  response_type: 'code',                                // PKCE is automatic
  scope: 'openid email profile',
  automaticSilentRenew: true,                           // uses the refresh token
  userStore: new WebStorageStateStore({ store: window.sessionStorage }),
})

// Sign in button
export const signIn = () => auth.signinRedirect({ state: { returnTo: location.pathname } })

// /auth/callback route
export async function handleCallback() {
  const user = await auth.signinRedirectCallback()
  history.replaceState(null, '', (user.state as any)?.returnTo ?? '/')
}

// Calling an API
export async function api(path: string, init: RequestInit = {}) {
  const user = await auth.getUser()
  if (!user || user.expired) return signIn()
  return fetch(path, { ...init, headers: { ...init.headers, Authorization: `Bearer ${user.access_token}` } })
}
```

**Notes:**
- `sessionStorage` means the user signs in again in each new tab. Thanks to SSO this is a quick, invisible redirect, not a password prompt.
- Ship a strict **Content-Security-Policy**. In an SPA, any injected script can read tokens.
- If the library's discovery fails because of browser CORS, check the network tab. You can pass the endpoints from section 13 of supabase.md manually through `metadata`.

---

## 7. Mobile apps

### 7.1 Non-negotiables
- **Use the system browser for login:**
  - iOS: `ASWebAuthenticationSession`, which AppAuth uses by default
  - Android: Custom Tabs, which AppAuth uses by default
- **Never use an embedded WebView.** It can't see the accounts site's browser session, so SSO wouldn't work. It's also a security risk, and Apple and Google discourage it.
- On iOS, leave `prefersEphemeralWebBrowserSession = false`. If set to `true`, the browser forgets the SSO session.
- **Public client, no secret,** with PKCE.
- **Store tokens in the Keychain (iOS) or Keystore-backed encrypted storage (Android).** Never in UserDefaults or plain SharedPreferences.
- **Redirect URI:** prefer a claimed HTTPS link (Universal Link / App Link). Otherwise use a reverse-DNS custom scheme such as `com.example.appa:/oauth/callback`. Register exactly what you use.

### 7.2 What the user sees
```
┌──────────────────────────────┐
│  "App A" Wants to Use        │   ← system prompt (iOS) the first time
│  "example.com" to Sign In    │
│      [Cancel]  [Continue]    │
└──────────────────────────────┘
              ↓
┌──────────────────────────────┐
│  accounts.example.com        │   ← browser sheet
│  Email    [            ]     │   (skipped entirely if already signed in:
│  Password [            ]     │    the sheet opens and closes by itself)
│       [ Sign in ]            │
└──────────────────────────────┘
              ↓
        back in the app, signed in
```

### 7.3 iOS sketch (AppAuth-iOS)
```swift
import AppAuth

let issuer = URL(string: "https://<project-ref>.supabase.co/auth/v1")!
let clientID = "<ios-client-id>"
let redirectURI = URL(string: "com.example.appa:/oauth/callback")!

func signIn(from viewController: UIViewController) {
    OIDAuthorizationService.discoverConfiguration(forIssuer: issuer) { config, error in
        guard let config else { return showError(error) }

        let request = OIDAuthorizationRequest(
            configuration: config,
            clientId: clientID,
            scopes: [OIDScopeOpenID, OIDScopeEmail, OIDScopeProfile],
            redirectURL: redirectURI,
            responseType: OIDResponseTypeCode,
            additionalParameters: nil          // PKCE, state and nonce are generated automatically
        )

        currentAuthFlow = OIDAuthState.authState(byPresenting: request, presenting: viewController) { state, error in
            guard let state else { return showError(error) }
            TokenStore.save(state)              // archive OIDAuthState into the Keychain
        }
    }
}

// Before every API call: refreshes automatically when needed
func withAccessToken(_ work: @escaping (String) -> Void) {
    guard let state = TokenStore.load() else { return requireSignIn() }
    state.performAction { accessToken, _, error in
        guard let accessToken, error == nil else { return requireSignIn() }
        TokenStore.save(state)                  // the refresh token may have rotated
        work(accessToken)
    }
}
```

For a custom scheme, add it under `CFBundleURLTypes`. For Universal Links, add the Associated Domains entitlement and host the `apple-app-site-association` file on the redirect domain.

### 7.4 Android sketch (AppAuth-Android)
```kotlin
val issuer = Uri.parse("https://<project-ref>.supabase.co/auth/v1")

AuthorizationServiceConfiguration.fetchFromIssuer(issuer) { config, ex ->
    if (config == null) return@fetchFromIssuer showError(ex)
    val request = AuthorizationRequest.Builder(
        config, CLIENT_ID, ResponseTypeValues.CODE, Uri.parse("com.example.appa:/oauth/callback")
    ).setScopes("openid", "email", "profile").build()

    launcher.launch(authService.getAuthorizationRequestIntent(request))
}

// In the launcher result: exchange the code, then persist AuthState (encrypted)
val response = AuthorizationResponse.fromIntent(data)
authService.performTokenRequest(response!!.createTokenExchangeRequest()) { tokens, ex ->
    authState.update(tokens, ex)
    tokenStore.save(authState)
}

// Before API calls
authState.performActionWithFreshTokens(authService) { accessToken, _, ex ->
    tokenStore.save(authState)
    if (accessToken == null) requireSignIn() else callApi(accessToken)
}
```

Declare the redirect scheme with `manifestPlaceholders["appAuthRedirectScheme"] = "com.example.appa"`, or use a verified App Link.

### 7.5 Optional: skipping the browser sheet between your own iOS apps
If all your iOS apps ship from the **same Apple Developer team**, they can share a Keychain access group. One app could then reuse a signed-in state written by another. This adds complexity and some risk: a bug in one app exposes tokens for all of them. Start with the standard browser flow, which already skips the password prompt.

---

## 8. Token handling rules (all platforms)

1. **Refresh before expiry,** for example when less than 60 seconds remain, or after a `401` from your API. Retry the request once.
2. **Save the new refresh token after every refresh.** The old one stops working.
3. **Allow only one refresh at a time** per signed-in user (a lock or a shared promise). Parallel refreshes with the same token can revoke the session.
4. **If a refresh fails with `invalid_grant` or a 4xx,** treat the user as signed out: clear tokens and show "Sign in". This happens after a global sign-out, a ban, a revoked app, or an expired session.
5. **When offline,** keep the tokens and retry later. Don't sign the user out because of network errors.
6. **Never log tokens,** and never put them in URLs, analytics, or crash reports.
7. **Never send the ID token to APIs.** Use the access token.

---

## 9. Your backend: trusting the access token

Every API that receives `Authorization: Bearer <token>` must verify it **locally** using Supabase's public keys. Don't call Supabase on every request.

**Checks, in order:**
1. **Signature** valid, using a key from JWKS, with the algorithm allow-listed (`ES256`, `RS256`). Reject `none` and `HS256`.
2. `iss` equals your issuer exactly.
3. `aud` equals `authenticated`.
4. `exp` is in the future (allow up to about 30 seconds of clock skew).
5. `app` equals **this** app's name, so a token issued to another app is rejected.
6. Optionally, `client_id` is in this app's allow-list of client IDs.

Then use `sub` as the user ID.

### Node (`jose`)
```ts
import { createRemoteJWKSet, jwtVerify } from 'jose'

const ISSUER = process.env.AUTH_ISSUER!                       // https://<project-ref>.supabase.co/auth/v1
const JWKS = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`))   // cached, auto-refreshed

export async function authenticate(req) {
  const header = req.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) throw new HttpError(401, 'missing_token')

  const { payload } = await jwtVerify(token, JWKS, {
    issuer: ISSUER,
    audience: 'authenticated',
    algorithms: ['ES256', 'RS256'],
    clockTolerance: 30,
  }).catch(() => { throw new HttpError(401, 'invalid_token') })

  if (payload.app !== process.env.APP_NAME) throw new HttpError(403, 'wrong_app')

  return { userId: payload.sub as string, email: payload.email as string }
}
```

### Python (`PyJWT`)
```python
import os
import jwt
from jwt import PyJWKClient

ISSUER = os.environ["AUTH_ISSUER"]
APP_NAME = os.environ["APP_NAME"]
_jwks = PyJWKClient(f"{ISSUER}/.well-known/jwks.json", cache_keys=True)

def authenticate(authorization_header: str | None) -> dict:
    if not authorization_header or not authorization_header.startswith("Bearer "):
        raise Unauthorized("missing_token")
    token = authorization_header.removeprefix("Bearer ")
    try:
        key = _jwks.get_signing_key_from_jwt(token).key
        claims = jwt.decode(
            token,
            key,
            algorithms=["ES256", "RS256"],
            issuer=ISSUER,
            audience="authenticated",
            leeway=30,
            options={"require": ["exp", "iat", "sub", "iss", "aud"]},
        )
    except jwt.PyJWTError:
        raise Unauthorized("invalid_token")
    if claims.get("app") != APP_NAME:
        raise Forbidden("wrong_app")
    return {"user_id": claims["sub"], "email": claims.get("email")}
```

**Notes:**
- Return `401` for a missing, invalid or expired token; the app should refresh and retry. Return `403` when the user is valid but not allowed.
- **Authentication is not authorization.** After verifying the token, still check that the user owns or may access the requested resource.
- Access tokens stay valid until they expire, even after sign-out. If an action must reflect revocation immediately (deleting an account, payments), call `GET {issuer}/user` or `{issuer}/oauth/userinfo` with the token to confirm the session is still active.

---

## 10. Using the Supabase database directly from an app (optional)

If an app stores its data in the same Supabase project and calls it directly (no backend of its own), give the Supabase client the OAuth access token:

```ts
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  db: { schema: 'app_a' },
  accessToken: async () => await getFreshAccessToken(),   // from your OIDC library
})

const { data, error } = await supabase.from('items').select('*')
```

- Row Level Security decides what the user can see, using `auth.uid()` and the `app` claim (supabase.md section 10).
- With `accessToken` set, `supabase.auth.*` methods are disabled in that client. That's expected: sign-in belongs to the OIDC library and the accounts site.
- Other Supabase SDKs (Swift, Kotlin, Dart) have an equivalent "custom access token" option; check your SDK version's docs.

---

## 11. Users in your app's own data

- **Store only `sub` (as `user_id`)** in your tables. Don't copy passwords (you never have them) or emails, unless you truly need email for app features.
- **Create app-specific profile rows on first sign-in** ("just-in-time provisioning"): if no row exists for `sub`, create one.
- **Display:** show the `email` claim from the latest token. If you store it, update it whenever a new token shows a different value. If your app needs a display name, keep it in your own profile table.
- **Account deletion:** subscribe to a deletion signal and delete the user's data, or use a foreign key with `on delete cascade` if the app's tables live in the same Supabase project. A Supabase Database Webhook on `auth.users` deletes works for external backends.

---

## 12. Signing out

| User action | App does |
|---|---|
| **Sign out (this app)** | Delete local tokens and the server session. The user stays signed in on the accounts site, so the next sign-in is instant. |
| **Sign out everywhere** | Delete local tokens, then send the user to `https://accounts.example.com/logout?scope=global&return_to=<url>`. The accounts site ends every session; other apps lose access by the time their access token expires. |
| **Forced sign-out** (refresh failed) | Clear tokens and show the signed-out screen. |

- **On mobile,** open the logout URL with the same system browser session (`ASWebAuthenticationSession` / Custom Tabs) so the browser's SSO session is cleared too.
- **The accounts site only redirects** to `return_to` values on its allow-list (your apps' registered origins), to prevent open redirects. The list is the build-time setting `VITE_LOGOUT_RETURN_ORIGINS` (comma-separated origins), so adding an app means updating it and redeploying the accounts site (see section 16 and hosting.md).
- **Pick one meaning for the app's main "Sign out" button,** and use it in every app. A sensible default: "Sign out" means this app only, and the accounts page offers "Sign out of all apps".

---

## 13. Account management

Apps don't build their own account screens. Link to the accounts site instead.

| Need | Link | Status |
|---|---|---|
| Account overview, sign out, sign out of all apps | `https://accounts.example.com/` | **Built** |
| Sign up (new users) | Start the normal sign-in flow; the accounts site's login page has a "Create account" tab. | **Built** |
| Change password while signed in | `https://accounts.example.com/account/password` | Planned, not built. Today users use "Forgot password?" on the login page. |
| Change email | `https://accounts.example.com/account/email` | Planned, not built |
| Apps with access / revoke | `https://accounts.example.com/account/apps` | Planned, not built |
| Delete account | `https://accounts.example.com/account/delete` | Planned, not built. Needs server-side code, because deleting a user requires the secret key. |
| Edit profile details | not decided yet | Planned, not built |

Only link to routes marked **Built**; the others return the accounts site's "not found" page until they exist.

A new user who signs up from inside an app confirms their email and lands on the accounts site's account page. They then return to the app and sign in again, which is instant because the accounts site already has their session.

After an email change, the new address shows up in the app at the next token refresh.

---

## 14. Errors and edge cases

| Situation | What the app sees | What to do |
|---|---|---|
| User cancels the login sheet or page | Callback with `error=access_denied`, or a cancellation error from AppAuth | Return to the signed-out screen; no error message needed. |
| `state` mismatch | Library error | Discard the callback, start over. Never ignore it. |
| Code expired or reused | `invalid_grant` on token exchange | Restart sign-in. |
| App disabled in the registry | Token exchange or refresh fails (403 from the hook) | Show "This app is temporarily unavailable". |
| User banned or deleted | Refresh fails | Sign out locally. |
| Session expired (time-box or inactivity) | Refresh fails | Sign out locally; the next sign-in may ask for the password. |
| Accounts site down | Login page doesn't load | Show a retry; signed-in users keep working until their refresh token is rejected. |
| Clock skew on device | Tokens look expired or not yet valid | Rely on `expires_in` from the token response rather than comparing `exp` with the device clock. |

---

## 15. Security checklist for every app

- [ ] Uses a maintained OAuth/OIDC library, authorization code + PKCE (S256).
- [ ] `state` (and `nonce` for ID tokens) generated per login and verified.
- [ ] Exact redirect URIs; no open redirects (`returnTo` / `return_to` validated).
- [ ] Mobile: system browser, no WebView; tokens in Keychain/Keystore.
- [ ] Web: prefer server-side tokens with HttpOnly, Secure, SameSite cookies; SPA has a strict CSP.
- [ ] No client secret in browser or mobile code; the Supabase secret key is never present.
- [ ] Rotated refresh tokens persisted; single-flight refresh.
- [ ] Backend verifies signature, `iss`, `aud`, `exp`, algorithm allow-list, and `app`.
- [ ] Backend authorizes each resource access (not just "is signed in").
- [ ] Tokens never logged or sent to analytics.
- [ ] Separate client IDs and config for dev and prod.

---

## 16. Onboarding a new application

1. **Pick the app name** used in tokens, e.g. `app_c` (lowercase, underscores).
2. **Register OAuth clients** in Supabase: one per platform, per environment, each with exact redirect URIs (supabase.md section 9.3).
3. **Add each client** to `private.oauth_apps` with that app name (supabase.md section 9.4).
4. **If the app uses the Supabase database:** create its schema, tables and RLS policies checking `app = 'app_c'`, then expose the schema (supabase.md section 10).
5. **Add the app's origin to the accounts site's `return_to` allow-list.** Append it to `VITE_LOGOUT_RETURN_ORIGINS` (comma-separated origins, no paths) in the accounts site's build settings, then redeploy it. It's read at build time, so the change doesn't take effect until the new build is live.
6. **Integrate sign-in** (sections 5–7), token handling (section 8), and backend verification (section 9).
7. **Test:** follow [testing.md](./testing.md). It covers:
   - first sign-in
   - SSO from another app with no password prompt
   - refresh
   - sign out (this app and everywhere)
   - disabled client
   - a token from another app rejected by this backend
8. **Repeat** in production with the production clients.
