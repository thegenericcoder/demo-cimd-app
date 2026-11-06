# CIMD demo app

Static helper for demoing **Client ID Metadata Document (CIMD)** against
[kube-nightlybuild-dev](https://kube-nightlybuild-dev.cidaas.de/trust-desk).

Hosted on **GitHub Pages** (no ngrok, no Node server at runtime):

**https://thegenericcoder.github.io/demo-cimd-app/**

| URL | Purpose |
| :--- | :--- |
| [/](https://thegenericcoder.github.io/demo-cimd-app/) | Demo UI — authorize (code) + client credentials |
| [/client.json](https://thegenericcoder.github.io/demo-cimd-app/client.json) | Code-flow metadata (`auth method none`, PKCE) |
| [/invalid/client.json](https://thegenericcoder.github.io/demo-cimd-app/invalid/client.json) | Failure-path metadata (`client_id` **does not** match URL) |
| [/callback.html](https://thegenericcoder.github.io/demo-cimd-app/callback.html) | OAuth redirect (code masked; claims on success) |
| [/cc/client.json](https://thegenericcoder.github.io/demo-cimd-app/cc/client.json) | Client-credentials metadata (`private_key_jwt`) |
| [/cc/jwks.json](https://thegenericcoder.github.io/demo-cimd-app/cc/jwks.json) | Public JWKS for the CC demo client |
| [/cc/private-jwk.demo.json](https://thegenericcoder.github.io/demo-cimd-app/cc/private-jwk.demo.json) | **Demo-only** private JWK (not for production) |

`resolve-preview` is **not** used — validation is a real authorize against nightly.

---

## Deploy to GitHub Pages

Repo: [thegenericcoder/demo-cimd-app](https://github.com/thegenericcoder/demo-cimd-app)

1. Push `main` with `index.html`, `client.json`, `callback.html`, and the `cc/` folder at the repo root.
2. GitHub → **Settings → Pages**
   - **Source:** Deploy from a branch
   - **Branch:** `main` / `/ (root)`
   - Save
3. Wait until the site is live at  
   `https://thegenericcoder.github.io/demo-cimd-app/`
4. Confirm metadata headers:

```bash
curl -sI "https://thegenericcoder.github.io/demo-cimd-app/client.json"
# Expect: HTTP 200, Content-Type: application/json
curl -s "https://thegenericcoder.github.io/demo-cimd-app/client.json" | jq -r .client_id
# Must equal https://thegenericcoder.github.io/demo-cimd-app/client.json
```

If you rename the repo or use a custom domain, update `client_id` and `redirect_uris` in `client.json` and the constants in `index.html` so they match the public URLs exactly.

---

## Validation steps

### 1. Confirm the public document

```bash
curl -sI "https://thegenericcoder.github.io/demo-cimd-app/client.json"
curl -s "https://thegenericcoder.github.io/demo-cimd-app/client.json" | jq .
```

| Field | Expect |
| :--- | :--- |
| `client_id` | Exactly `https://thegenericcoder.github.io/demo-cimd-app/client.json` |
| `token_endpoint_auth_method` | `"none"` |
| `redirect_uris` | Includes `https://thegenericcoder.github.io/demo-cimd-app/callback.html` |
| `grant_types` / `response_types` | `authorization_code` / `code` |

### 2. Trust Desk host rule

1. Open [Trust Desk](https://kube-nightlybuild-dev.cidaas.de/trust-desk) → **Integrations → App Management Policies → CIMD**
2. **Add rule**
   - **Host:** `thegenericcoder.github.io`
   - **Path prefix:** `/demo-cimd-app/`
   - **Effect:** Allow
3. Keep **CIMD enabled** → **Save**

(Path prefix is important on `github.io` so you do not admit every Pages site under that user.)

### 3. Happy-path authorize (required proof)

1. Open https://thegenericcoder.github.io/demo-cimd-app/
2. Click **Start authorize** (uses `client.json`)
3. Interpret the result:

| Result | Meaning |
| :--- | :--- |
| Nightly **login** (or consent) page | Client **admitted** — CIMD works |
| `invalid_client` / unknown client | Host rule missing, CIMD off, or fetch/validation failed |
| Redirect URI error | Document `redirect_uris` does not match the request |

Serving `client.json` alone is **not** enough — step 3 is the real validation.

### 3b. Failure-path authorize (validation refusal)

Same host rule covers `/invalid/client.json` (under `/demo-cimd-app/`), so **admission** succeeds and **fetch** succeeds. The document is invalid because its `client_id` still points at `…/client.json` while the URL is `…/invalid/client.json`.

1. Click **Start authorize (expect failure)**
2. Expect `invalid_client` (metadata invalid / `client_id` mismatch) — not login

This shows CIMD rejecting a bad document without needing a second Trust Desk rule.

### 4. Complete login + token exchange

1. Sign in with a nightly test user.
2. Browser returns to `callback.html`.
3. The page exchanges the code at `/token-srv/token` using the PKCE verifier stored in `sessionStorage` (same browser tab/session as **Start authorize**).
4. Success UI shows masked tokens plus **decoded JWT claims** for `id_token` and `access_token` (payload only; signature not verified). Full token strings stay masked.

You must start authorize and finish login in the **same browser** so the verifier is available.

### 5. Client credentials (`private_key_jwt`)

CIMD **rejects** `client_credentials` with `token_endpoint_auth_method: none`. The CC demo uses a separate document:

```bash
curl -s "https://thegenericcoder.github.io/demo-cimd-app/cc/client.json" | jq .
curl -s "https://thegenericcoder.github.io/demo-cimd-app/cc/jwks.json" | jq .
```

| Field | Expect |
| :--- | :--- |
| `client_id` | Exactly `https://thegenericcoder.github.io/demo-cimd-app/cc/client.json` |
| `grant_types` | `["client_credentials"]` |
| `token_endpoint_auth_method` | `"private_key_jwt"` |
| `jwks_uri` | `https://thegenericcoder.github.io/demo-cimd-app/cc/jwks.json` |

Trust Desk ceilings must allow **`client_credentials`** and **`private_key_jwt`** (and a scope such as `profile` if you pass one).

1. Open https://thegenericcoder.github.io/demo-cimd-app/
2. Click **Get client-credentials token**
3. Expect HTTP 200 with a masked `access_token` (and decoded claims when JWT)

The page signs a `client_assertion` with the **demo-only** key in `/cc/private-jwk.demo.json`. Do not reuse that key outside this demo.

### 6. Optional — negative case

| Action | Expect |
| :--- | :--- |
| Remove the allow rule or turn **CIMD enabled** off → Save → authorize again | Refuse / `invalid_client` |

Restore CIMD + the allow rule afterward.

---

## Checklist

- [ ] Pages site live; `client.json` returns `200` + `application/json`
- [ ] `client_id` in JSON equals the public URL
- [ ] Trust Desk allow: host `thegenericcoder.github.io`, path `/demo-cimd-app/`
- [ ] Authorize reaches login
- [ ] Login + token exchange succeeds on `callback.html`
- [ ] `/cc/client.json` + `/cc/jwks.json` live; ceilings allow `client_credentials` + `private_key_jwt`
- [ ] **Get client-credentials token** returns 200
- [ ] (Optional) Negative case shown

---

## Pitfalls

- **`client_id` must match the URL character-for-character** after any rename or custom domain.
- **Path prefix** on shared `*.github.io` hosts — prefer `/demo-cimd-app/`.
- **Pages cache** — after editing metadata, hard-refresh or wait; cidaas also caches fetched documents (min ~5 minutes).
- **Ceilings** — code flow needs `authorization_code` + `none`; CC needs `client_credentials` + `private_key_jwt`.
- **Demo private key** — `/cc/private-jwk.demo.json` is intentionally public for the static demo; rotate if you fork for anything else.
