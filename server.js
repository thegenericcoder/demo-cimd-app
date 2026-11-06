#!/usr/bin/env node
/**
 * Local CIMD demo host.
 *
 * Serves client metadata as application/json (required by cidaas fetch).
 * client_id is derived from PUBLIC_BASE_URL so it matches the tunnel URL.
 *
 * Usage:
 *   PUBLIC_BASE_URL=https://<ngrok-host> node server.js
 *   # other terminal: ngrok http 8080
 *
 * Env:
 *   PUBLIC_BASE_URL  HTTPS origin cidaas will fetch (required for a real demo)
 *   METADATA_PORT    metadata + UI (default 8080) — expose this via tunnel
 *   CALLBACK_PORT    local OAuth redirect (default 9000) — do not tunnel
 *   ISSUER           cidaas issuer (default kube-nightlybuild-dev)
 */

import http from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { URL } from 'node:url';

const METADATA_PORT = Number(process.env.METADATA_PORT || 8080);
const CALLBACK_PORT = Number(process.env.CALLBACK_PORT || 9000);
const ISSUER = (process.env.ISSUER || 'https://kube-nightlybuild-dev.cidaas.de').replace(
  /\/$/,
  '',
);
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || `http://127.0.0.1:${METADATA_PORT}`).replace(
  /\/$/,
  '',
);

const REDIRECT_URI = `http://127.0.0.1:${CALLBACK_PORT}/oauth/callback`;
const METADATA_PATH = '/client.json';

function metadataDocument() {
  const clientId = `${PUBLIC_BASE_URL}${METADATA_PATH}`;
  return {
    client_id: clientId,
    client_name: 'CIMD local demo client',
    redirect_uris: [REDIRECT_URI],
    grant_types: ['authorization_code'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  };
}

function b64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function pkcePair() {
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'Content-Length': Buffer.byteLength(payload),
    ...headers,
  });
  res.end(payload);
}

function htmlPage() {
  const doc = metadataDocument();
  const { challenge } = pkcePair();
  const authz = new URL(`${ISSUER}/authz-srv/authz`);
  authz.searchParams.set('client_id', doc.client_id);
  authz.searchParams.set('response_type', 'code');
  authz.searchParams.set('redirect_uri', REDIRECT_URI);
  authz.searchParams.set('scope', 'openid profile email');
  authz.searchParams.set('code_challenge', challenge);
  authz.searchParams.set('code_challenge_method', 'S256');
  authz.searchParams.set('state', 'cimd-demo');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>CIMD demo</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; max-width: 36rem; margin: 3rem auto; padding: 0 1rem; line-height: 1.5; color: #18181b; }
    p { color: #3f3f46; }
    code { font-size: 0.9em; background: #f4f4f5; padding: 0.1rem 0.35rem; border-radius: 4px; }
    a.btn { display: inline-block; margin-top: 1.25rem; padding: 0.65rem 1.1rem; background: #18181b; color: #fff; text-decoration: none; border-radius: 6px; }
  </style>
</head>
<body>
  <h1>CIMD demo</h1>
  <p>Local metadata host for Client ID Metadata Document demos against cidaas nightly.
     Serves <code>/client.json</code> as the OAuth <code>client_id</code>.</p>
  <a class="btn" href="${authz.toString()}">Start authorize</a>
</body>
</html>`;
}

function onMetadataRequest(req, res) {
  const url = new URL(req.url || '/', `http://127.0.0.1:${METADATA_PORT}`);

  if (req.method === 'GET' && (url.pathname === METADATA_PATH || url.pathname === '/.well-known/oauth-client')) {
    // Same document on both paths; client_id always points at /client.json.
    return send(res, 200, metadataDocument(), {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'max-age=300',
    });
  }

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    return send(res, 200, htmlPage(), { 'Content-Type': 'text/html; charset=utf-8' });
  }

  return send(res, 404, { error: 'not_found' }, { 'Content-Type': 'application/json' });
}

function onCallbackRequest(req, res) {
  const url = new URL(req.url || '/', `http://127.0.0.1:${CALLBACK_PORT}`);
  if (req.method !== 'GET' || url.pathname !== '/oauth/callback') {
    return send(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' });
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const err = url.searchParams.get('error');
  const desc = url.searchParams.get('error_description');

  // Mask the code in the UI — do not display the full value.
  const maskedCode =
    !code || code.length < 8
      ? '********'
      : `${code.slice(0, 4)}${'*'.repeat(Math.min(code.length - 8, 24))}${code.slice(-4)}`;

  const body = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><title>CIMD callback</title>
<style>body{font-family:ui-sans-serif,system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem}pre{background:#f4f4f5;padding:1rem;overflow:auto}</style>
</head><body>
<h1>OAuth callback</h1>
${
  err
    ? `<p>Error: <code>${err}</code></p><pre>${desc || ''}</pre>`
    : `<p>Admitted and redirected — authorization code received.</p>
       <pre>code=${maskedCode}
state=${state || ''}</pre>`
}
</body></html>`;
  return send(res, 200, body, { 'Content-Type': 'text/html; charset=utf-8' });
}

const metadataServer = http.createServer(onMetadataRequest);
const callbackServer = http.createServer(onCallbackRequest);

metadataServer.listen(METADATA_PORT, '127.0.0.1', () => {
  console.log(`Metadata + UI  http://127.0.0.1:${METADATA_PORT}/`);
  console.log(`Metadata JSON  http://127.0.0.1:${METADATA_PORT}${METADATA_PATH}`);
  console.log(`PUBLIC_BASE_URL ${PUBLIC_BASE_URL}`);
  console.log(`client_id       ${PUBLIC_BASE_URL}${METADATA_PATH}`);
  if (!PUBLIC_BASE_URL.startsWith('https://')) {
    console.log('Tip: tunnel this port, then restart with PUBLIC_BASE_URL=https://…');
  }
});

callbackServer.listen(CALLBACK_PORT, '127.0.0.1', () => {
  console.log(`Callback       ${REDIRECT_URI}`);
});
