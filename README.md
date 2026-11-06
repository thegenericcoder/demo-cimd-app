# CIMD demo app

Local helper for demoing **Client ID Metadata Document (CIMD)** against
[kube-nightlybuild-dev](https://kube-nightlybuild-dev.cidaas.de/trust-desk).

It:

- Serves `/client.json` with `Content-Type: application/json` (required by cidaas fetch)
- Sets `client_id` from `PUBLIC_BASE_URL` so it matches your public tunnel URL
- Exposes a small UI with a PKCE **Start authorize** link
- Listens for the OAuth callback on `http://127.0.0.1:9000/oauth/callback`

There is **no** `.env` file and **no** npm dependencies. Pass env vars on the command line.

Default issuer: `https://kube-nightlybuild-dev.cidaas.de`  
`resolve-preview` is **not** used — validation is a real authorize.

---

## Prerequisites

- Node.js 18+
- A public HTTPS tunnel to port `8080` (e.g. [ngrok](https://ngrok.com/))
- Admin access to Trust Desk on nightly
- CIMD feature enabled for the tenant

---

## Quick start

```bash
cd cimd-demo-app

# Terminal B — expose metadata only (do not tunnel port 9000)
ngrok http 8080
# Copy the https://….ngrok-free.dev (or .app) URL

# Terminal A — PUBLIC_BASE_URL must be that exact https origin
PUBLIC_BASE_URL=https://<tunnel-host> npm start
```

Then open [http://127.0.0.1:8080/](http://127.0.0.1:8080/).

| Local URL | Purpose |
| :--- | :--- |
| `http://127.0.0.1:8080/` | Demo UI |
| `http://127.0.0.1:8080/client.json` | Metadata document |
| `http://127.0.0.1:9000/oauth/callback` | Redirect after login |

---

## Environment

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PUBLIC_BASE_URL` | `http://127.0.0.1:8080` | HTTPS origin cidaas will fetch. Must match the tunnel. |
| `METADATA_PORT` | `8080` | Metadata + UI (tunnel this) |
| `CALLBACK_PORT` | `9000` | Local redirect only |
| `ISSUER` | `https://kube-nightlybuild-dev.cidaas.de` | cidaas tenant base URL |

---

## Validation steps

Replace `<tunnel-host>` with your ngrok hostname (hostname only in Trust Desk; full `https://…` for curls and `PUBLIC_BASE_URL`).

### 1. Confirm the public document

```bash
curl -sI "https://<tunnel-host>/client.json"
# Expect: HTTP 200, Content-Type: application/json

curl -s "https://<tunnel-host>/client.json" | jq .
```

| Field | Expect |
| :--- | :--- |
| `client_id` | Exactly `https://<tunnel-host>/client.json` |
| `token_endpoint_auth_method` | `"none"` |
| `redirect_uris` | Includes `http://127.0.0.1:9000/oauth/callback` |
| `grant_types` / `response_types` | `authorization_code` / `code` |

If `client_id` still shows `127.0.0.1`, restart with the correct `PUBLIC_BASE_URL`.

### 2. Trust Desk host rule

1. Open [Trust Desk](https://kube-nightlybuild-dev.cidaas.de/trust-desk) → **Integrations → App Management Policies → CIMD**
2. **Add rule**
   - **Host:** `<tunnel-host>` (no `https://`)
   - **Path prefix:** leave empty
   - **Effect:** Allow
3. Keep **CIMD enabled** → **Save**

### 3. Happy-path authorize (required proof)

1. Open [http://127.0.0.1:8080/](http://127.0.0.1:8080/)
2. Click **Start authorize**
3. Interpret the result:

| Result | Meaning |
| :--- | :--- |
| Nightly **login** (or consent) page | Client **admitted** — CIMD works |
| `invalid_client` / unknown client | Host rule missing, CIMD off, or fetch/validation failed |
| Redirect URI error | Document `redirect_uris` does not match the request |

Serving `/client.json` alone is **not** enough — step 3 is the real validation.

### 4. Optional — complete login

Sign in with a nightly test user → expect  
`http://127.0.0.1:9000/oauth/callback?code=…&state=cimd-demo`.

### 5. Optional — negative case

| Action | Expect |
| :--- | :--- |
| Remove the allow rule or turn **CIMD enabled** off → Save → authorize again | Refuse / `invalid_client` |

Restore CIMD + the allow rule afterward.

---

## Checklist

- [ ] Tunnel HTTPS URL returns `200` + `application/json`
- [ ] `client_id` in JSON equals the public URL
- [ ] Trust Desk allow rule for the tunnel host saved; CIMD on
- [ ] Authorize reaches login
- [ ] (Optional) Login returns `code` on `:9000`
- [ ] (Optional) Negative case shown

---

## Pitfalls

- **GitHub/gist raw** returns `text/plain` — cidaas refuses it; this app exists to avoid that.
- **`PUBLIC_BASE_URL` without HTTPS** — nightly cannot fetch localhost; always use the tunnel origin.
- **Tunnel host changes** — update Trust Desk host rule and restart with the new `PUBLIC_BASE_URL`.
- **ngrok interstitial** — if the first browser hit shows an ngrok warning page, visit the URL once in the browser; server-to-server fetch from cidaas may still need a paid/stable tunnel if ngrok blocks bots.
- **Ceilings** — document grant/auth methods must stay within the CIMD policy ceilings (defaults already allow `authorization_code` + `none`).
