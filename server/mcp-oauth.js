import crypto from 'node:crypto';
import { config } from './config.js';

const clients = new Map();
const usedCodes = new Set();

function b64(value) { return Buffer.from(value).toString('base64url'); }
function sign(value) {
  return crypto.createHmac('sha256', config.mcpOAuthSecret).update(value).digest('base64url');
}
function encode(payload) {
  const body = b64(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}
function decode(token) {
  const [body, signature] = String(token || '').split('.');
  if (!body || !signature || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(sign(body)))) throw new Error('Invalid token');
  return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
}
function random() { return crypto.randomBytes(32).toString('base64url'); }
function validRedirect(client, redirectUri) { return client?.redirect_uris?.includes(redirectUri); }
function baseUrl(req) { return `${req.protocol}://${req.get('host')}`; }

export function mcpOAuthMetadata(req) {
  const issuer = baseUrl(req);
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    registration_endpoint: `${issuer}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['mcp:read']
  };
}

export function protectedResourceMetadata(req) {
  const issuer = baseUrl(req);
  return {
    resource: `${issuer}/mcp`,
    authorization_servers: [issuer],
    bearer_methods_supported: ['header'],
    scopes_supported: ['mcp:read']
  };
}

export function registerOAuthRoutes(app) {
  app.get('/.well-known/oauth-authorization-server', (req, res) => res.json(mcpOAuthMetadata(req)));
  app.get('/.well-known/oauth-protected-resource', (req, res) => res.json(protectedResourceMetadata(req)));

  app.post('/oauth/register', (req, res) => {
    const body = req.body || {};
    if (!Array.isArray(body.redirect_uris) || !body.redirect_uris.length || body.redirect_uris.some((uri) => typeof uri !== 'string' || !/^https?:\/\//.test(uri))) return res.status(400).json({ error: 'invalid_client_metadata' });
    const clientId = random();
    clients.set(clientId, { client_id: clientId, redirect_uris: body.redirect_uris, client_name: String(body.client_name || 'MCP client').slice(0, 120) });
    res.status(201).json({ client_id: clientId, client_name: clients.get(clientId).client_name, redirect_uris: body.redirect_uris, token_endpoint_auth_method: 'none' });
  });

  app.get('/oauth/authorize', (req, res) => {
    const { client_id: clientId, redirect_uri: redirectUri, response_type: responseType, code_challenge: challenge, code_challenge_method: method, state } = req.query;
    const client = clients.get(String(clientId || ''));
    if (responseType !== 'code' || !client || !validRedirect(client, redirectUri) || !challenge || method !== 'S256') return res.status(400).send('Invalid OAuth authorization request');
    const escaped = String(value => value);
    const safe = (value) => String(value || '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
    res.type('html').send(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>D&D Realm MCP</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font-family:system-ui;max-width:520px;margin:60px auto;padding:24px"><h1>D&D Realm</h1><p>Разрешить ChatGPT доступ к данным кампании через MCP?</p><form method="post" action="/oauth/authorize"><input type="hidden" name="client_id" value="${safe(clientId)}"><input type="hidden" name="redirect_uri" value="${safe(redirectUri)}"><input type="hidden" name="state" value="${safe(state)}"><input type="hidden" name="code_challenge" value="${safe(challenge)}"><label>Код доступа<br><input name="setup_code" type="password" required autocomplete="off" style="width:100%;padding:10px;margin:8px 0"></label><button name="approve" value="yes" type="submit">Разрешить доступ</button></form></body></html>`);
  });

  app.post('/oauth/authorize', (req, res) => {
    const { client_id: clientId, redirect_uri: redirectUri, state, code_challenge: challenge, setup_code: setupCode, approve } = req.body || {};
    const client = clients.get(String(clientId || ''));
    if (!client || !validRedirect(client, redirectUri) || approve !== 'yes' || !crypto.timingSafeEqual(Buffer.from(String(setupCode || '')), Buffer.from(String(config.mcpOAuthSetupCode || '')))) return res.status(403).send('Authorization denied');
    const code = encode({ typ: 'code', jti: random(), client_id: clientId, redirect_uri: redirectUri, challenge, scope: 'mcp:read', exp: Date.now() + 300000 });
    const url = new URL(redirectUri);
    url.searchParams.set('code', code);
    if (state) url.searchParams.set('state', state);
    res.redirect(url.toString());
  });

  app.post('/oauth/token', (req, res) => {
    const { grant_type: grantType, code, client_id: clientId, redirect_uri: redirectUri, code_verifier: verifier } = req.body || {};
    if (grantType !== 'authorization_code') return res.status(400).json({ error: 'unsupported_grant_type' });
    try {
      const payload = decode(code);
      if (payload.typ !== 'code' || payload.exp < Date.now() || payload.client_id !== clientId || payload.redirect_uri !== redirectUri || usedCodes.has(payload.jti)) throw new Error('Invalid authorization code');
      const expected = crypto.createHash('sha256').update(String(verifier || '')).digest('base64url');
      if (expected !== payload.challenge) throw new Error('PKCE verification failed');
      usedCodes.add(payload.jti);
      const accessToken = encode({ typ: 'access', jti: random(), client_id: clientId, scope: payload.scope, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 });
      return res.json({ access_token: accessToken, token_type: 'Bearer', expires_in: 30 * 24 * 60 * 60, scope: payload.scope });
    } catch { return res.status(400).json({ error: 'invalid_grant' }); }
  });
}

export function verifyOAuthAccessToken(token) {
  try {
    const payload = decode(token);
    if (payload.typ !== 'access' || payload.exp < Date.now() || payload.scope !== 'mcp:read') return false;
    return true;
  } catch { return false; }
}
