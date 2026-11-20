# End-to-end test recipe

Proves that an app can sign in through the accounts site, get working tokens, refresh them, and be cut off. It uses only `curl`, `openssl`, `python3` and a browser, with a throwaway OAuth client. Run it on the **dev** project, never production, and once after the first production deploy using a throwaway account.

**Never paste real tokens into chats, tickets or logs.** Everything below stays in your terminal session.

---

## 0. Before you start

- Dev project set up per [supabase.md](./supabase.md): OAuth server on, authorization path `/oauth/consent`, token hook enabled, migrations applied.
- Accounts site running: `cd web && npm run dev` (http://localhost:3000). The dev project's Site URL is `http://localhost:3000` and its Redirect URLs include `http://localhost:3000/**`.
- A **test account** you created through the accounts site's "Create account" tab and confirmed by email. Use a throwaway address and password.
- A terminal in the repo root with the dev project's values loaded (never echo them):

```sh
set -a; . ./.env; set +a
```

---

## 1. Register two throwaway clients

Two clients let you test SSO between apps. Both are public clients with a local redirect address.

```sh
create_client() {
  curl -s -X POST "$SUPABASE_URL/auth/v1/admin/oauth/clients" \
    -H "Authorization: Bearer $SUPABASE_SECRET_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"$1\",\"redirect_uris\":[\"http://localhost:8787/callback\"],\"client_type\":\"public\"}" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["client_id"])'
}
CLIENT_A=$(create_client demo-a-web-dev)
CLIENT_B=$(create_client demo-b-web-dev)
echo "$CLIENT_A  $CLIENT_B"
```

Add them to the app registry (Dashboard → SQL Editor), with the two IDs filled in:

```sql
insert into private.oauth_apps (client_id, app, platform) values
  ('<CLIENT_A>', 'demo_a', 'web'),
  ('<CLIENT_B>', 'demo_b', 'web');
```

---

## 2. Sign in as app A

Build a sign-in address with a fresh PKCE verifier, state and nonce:

```sh
VERIFIER=$(openssl rand -base64 48 | tr -d '=+/\n' | cut -c1-64)
CHALLENGE=$(printf %s "$VERIFIER" | openssl dgst -sha256 -binary | openssl base64 -A | tr '+/' '-_' | tr -d '=')
STATE=$(openssl rand -hex 16); NONCE=$(openssl rand -hex 16)
echo "$SUPABASE_URL/auth/v1/oauth/authorize?response_type=code&client_id=$CLIENT_A&redirect_uri=http%3A%2F%2Flocalhost%3A8787%2Fcallback&scope=openid%20email%20profile&state=$STATE&nonce=$NONCE&code_challenge=$CHALLENGE&code_challenge_method=S256"
```

Open that address in a browser.

- **Expected:** you reach the accounts site's login page. Sign in with the test account.
- The browser then goes to `http://localhost:8787/callback?code=…&state=…`. Nothing listens there, so it shows "can't connect". **That's expected.** Copy the `code` from the address bar and check that `state` equals `$STATE`.
- A code is valid for 10 minutes and works once.

---

## 3. Exchange the code for tokens

```sh
CODE='<paste the code>'
RESP=$(curl -s -X POST "$SUPABASE_URL/auth/v1/oauth/token" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d grant_type=authorization_code -d "code=$CODE" -d "client_id=$CLIENT_A" \
  -d 'redirect_uri=http://localhost:8787/callback' -d "code_verifier=$VERIFIER")
field() { printf %s "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('$1',''))"; }
ACCESS=$(field access_token); REFRESH=$(field refresh_token); ID_TOKEN=$(field id_token)
echo "access: ${#ACCESS} chars  refresh: ${#REFRESH} chars  id_token: ${#ID_TOKEN} chars"
```

**Expected:** all three have a length. If the response is an error, `printf %s "$RESP"` shows it (it contains no tokens when it's an error).

Decode the access token and check its claims:

```sh
decode() { python3 -c 'import sys,json,base64; t=sys.argv[1].split(".")[1]; print(json.dumps(json.loads(base64.urlsafe_b64decode(t+"="*(-len(t)%4))),indent=2))' "$1"; }
decode "$ACCESS"
```

| Claim | Expected |
|---|---|
| `aud` | `authenticated` |
| `client_id` | the value of `$CLIENT_A` |
| `app` | `demo_a` (comes from the hook; if it's missing the hook isn't enabled) |
| `sub` | the test user's ID |
| `email` | the test account's address |

Also check the ID token has your `nonce`: `decode "$ID_TOKEN"`.

Ask Supabase to vouch for the token:

```sh
curl -s "$SUPABASE_URL/auth/v1/oauth/userinfo" -H "Authorization: Bearer $ACCESS"
```

**Expected:** `sub` and `email`.

A backend built from implementation.md section 9 must accept this token for `APP_NAME=demo_a` and answer 403 `wrong_app` for `APP_NAME=demo_b`.

---

## 4. SSO: app B signs in without a password

Repeat section 2 with `CLIENT_B` and a **new** verifier, state and nonce, in the **same browser**.

**Expected:** no login form. The browser goes straight to the callback address with a code. Exchange it as in section 3, with `CLIENT_B` and the new verifier, but store the results in new variables (`ACCESS_B`, `REFRESH_B`) so you keep app A's tokens for section 5. The token has `app` = `demo_b` and the same `sub`.

If you see the login form again, the browser isn't sharing the accounts site's session. Check that you used the same browser profile and weren't in a private window.

---

## 5. Refresh and rotation

```sh
REFRESH_RESP=$(curl -s -X POST "$SUPABASE_URL/auth/v1/oauth/token" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d grant_type=refresh_token -d "refresh_token=$REFRESH" -d "client_id=$CLIENT_A")
printf %s "$REFRESH_RESP" | python3 -c 'import sys,json; d=json.load(sys.stdin); print({k:(len(v) if isinstance(v,str) else v) for k,v in d.items()})'
```

**Expected:** a new `access_token` and `refresh_token`. Save the new refresh token and discard the old one.

Wait about 15 seconds (longer than the reuse interval), then try the **old** refresh token again:

```sh
curl -s -X POST "$SUPABASE_URL/auth/v1/oauth/token" -H 'Content-Type: application/x-www-form-urlencoded' \
  -d grant_type=refresh_token -d "refresh_token=$REFRESH" -d "client_id=$CLIENT_A"
```

**Expected:** an error, not tokens. A reused refresh token may also end the whole session.

---

## 6. What a token can do beyond your own tables

An access token is the user's session. See what it can reach on Supabase's own user endpoint, using a token you still have:

```sh
curl -s "$SUPABASE_URL/auth/v1/user" -H "apikey: $SUPABASE_PUBLISHABLE_KEY" -H "Authorization: Bearer $ACCESS" | python3 -c 'import sys,json; d=json.load(sys.stdin); print({k:d.get(k) for k in ("id","email","role")})'
```

Only on the throwaway test account, check whether the token may change the password:

```sh
curl -s -X PUT "$SUPABASE_URL/auth/v1/user" -H "apikey: $SUPABASE_PUBLISHABLE_KEY" \
  -H "Authorization: Bearer $ACCESS" -H 'Content-Type: application/json' -d '{"password":"a-new-test-password-1"}' | head -c 200; echo
```

Record the result in your notes. If a token **can** change the password or email, that is the accepted trade-off for first-party apps (supabase.md section 10); it's the reason never to register an app you don't control.

---

## 7. Cut-off tests

**Disabled client.** In the SQL Editor:

```sql
update private.oauth_apps set enabled = false where app = 'demo_a';
```

Refresh with the current refresh token (section 5 command). **Expected:** 403 with "This application is not allowed to sign in." Then re-enable it (`enabled = true`) and refresh again: it works.

**Sign out everywhere.** In the browser, open `http://localhost:3000/logout?scope=global`. **Expected:** "You're signed out of every Sike app on all your devices." Then refresh with the current refresh token: it fails. The access token you already hold still works until it expires.

**Banned user.** Ban the test user in Authentication → Users. Refreshing and signing in both fail. Unban when done.

---

## 8. Clean up

```sh
for c in "$CLIENT_A" "$CLIENT_B"; do
  curl -s -X DELETE "$SUPABASE_URL/auth/v1/admin/oauth/clients/$c" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" -o /dev/null -w '%{http_code}\n'
done
```

(If that returns an error, delete both clients in Authentication → OAuth Apps instead.) Then run, in the SQL Editor:

```sql
delete from private.oauth_apps where app in ('demo_a', 'demo_b');
```

Finally delete the test user in Authentication → Users, and close the terminal so the tokens in its variables disappear.

---

## Pass criteria

- [ ] Token has `aud`, `client_id`, `app`, `sub`, `email` as in section 3.
- [ ] App B signs in with no password prompt (section 4).
- [ ] Refresh returns new tokens, and reusing the old refresh token fails (section 5).
- [ ] You recorded what the token can do on `/auth/v1/user` (section 6).
- [ ] Disabling the client, signing out everywhere and banning each cut the app off (section 7).
- [ ] Throwaway clients, registry rows and the test user are removed (section 8).
