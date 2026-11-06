# CIMD demo app

Static helper for demoing **Client ID Metadata Document (CIMD)** against
[kube-nightlybuild-dev](https://kube-nightlybuild-dev.cidaas.de/trust-desk).

Hosted on **GitHub Pages** (no ngrok, no Node server at runtime):

**https://thegenericcoder.github.io/demo-cimd-app/**

| URL | Purpose |
| :--- | :--- |
| [/](https://thegenericcoder.github.io/demo-cimd-app/) | Demo UI + **Start authorize** |
| [/client.json](https://thegenericcoder.github.io/demo-cimd-app/client.json) | Metadata document (`client_id`) |
| [/callback.html](https://thegenericcoder.github.io/demo-cimd-app/callback.html) | OAuth redirect (code masked in UI) |

`resolve-preview` is **not** used — validation is a real authorize against nightly.

---

## Deploy to GitHub Pages

Repo: [thegenericcoder/demo-cimd-app](https://github.com/thegenericcoder/demo-cimd-app)

1. Push `main` with `index.html`, `client.json`, and `callback.html` at the repo root.
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
2. Click **Start authorize**
3. Interpret the result:

| Result | Meaning |
| :--- | :--- |
| Nightly **login** (or consent) page | Client **admitted** — CIMD works |
| `invalid_client` / unknown client | Host rule missing, CIMD off, or fetch/validation failed |
| Redirect URI error | Document `redirect_uris` does not match the request |

Serving `client.json` alone is **not** enough — step 3 is the real validation.

### 4. Complete login + token exchange

1. Sign in with a nightly test user.
2. Browser returns to `callback.html`.
3. The page exchanges the code at `/token-srv/token` using the PKCE verifier stored in `sessionStorage` (same browser tab/session as **Start authorize**).
4. Success UI shows masked tokens plus **decoded JWT claims** for `id_token` and `access_token` (payload only; signature not verified). Full token strings stay masked.

You must start authorize and finish login in the **same browser** so the verifier is available.

### 5. Optional — negative case

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
- [ ] (Optional) Negative case shown

---

## Pitfalls

- **`client_id` must match the URL character-for-character** after any rename or custom domain.
- **Path prefix** on shared `*.github.io` hosts — prefer `/demo-cimd-app/`.
- **Pages cache** — after editing `client.json`, hard-refresh or wait; cidaas also caches fetched documents (min ~5 minutes).
- **Ceilings** — document grant/auth methods must stay within the CIMD policy (defaults allow `authorization_code` + `none`).
