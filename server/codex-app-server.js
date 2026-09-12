import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const CODEX_HOME = process.env.CODEX_HOME || '/data/codex';
const CONFIG_PATH = join(CODEX_HOME, 'config.toml');
const MCP_URL = process.env.DND_MCP_URL || 'https://atlas-infra.ru/mcp';
const CODEX_BIN = process.env.CODEX_BIN || 'codex';
const REQUEST_TIMEOUT_MS = Number(process.env.CODEX_REQUEST_TIMEOUT_MS || 120000);

let child = null;
let buffer = '';
let initialized = false;
let nextId = 1;
const pending = new Map();
const loginWaiters = new Map();
const listeners = new Set();

async function ensureConfig() {
  await mkdir(CODEX_HOME, { recursive: true });
  if (!process.env.DND_MCP_TOKEN) throw new Error('DND_MCP_TOKEN is not configured');

  const config = `cli_auth_credentials_store = "file"\ncheck_for_update_on_startup = false\n\n[mcp_servers.dnd_realm]\nurl = "${MCP_URL.replace(/"/g, '\\"')}"\nbearer_token_env_var = "DND_MCP_TOKEN"\nenabled = true\nrequired = true\nstartup_timeout_sec = 15\ntool_timeout_sec = 30\nenabled_tools = ["get_character", "get_game_state", "get_recent_history"]\ndefault_tools_approval_mode = "approve"\n`;
  try {
    const current = await readFile(CONFIG_PATH, 'utf8');
    if (current !== config) await writeFile(CONFIG_PATH, config, { mode: 0o600 });
  } catch {
    await writeFile(CONFIG_PATH, config, { mode: 0o600 });
  }
}

function rejectAll(error) {
  for (const waiter of pending.values()) waiter.reject(error);
  pending.clear();
  for (const waiter of loginWaiters.values()) waiter.reject(error);
  loginWaiters.clear();
  listeners.clear();
}

function handleMessage(message) {
  if (message.id !== undefined && message.id !== null) {
    const waiter = pending.get(String(message.id));
    if (waiter) {
      pending.delete(String(message.id));
      if (message.error) waiter.reject(new Error(message.error.message || 'Codex app-server request failed'));
      else waiter.resolve(message.result);
    }
  }

  if (message.method === 'account/login/completed') {
    const loginId = message.params?.loginId;
    if (loginId && loginWaiters.has(loginId)) {
      const waiter = loginWaiters.get(loginId);
      loginWaiters.delete(loginId);
      if (message.params?.success) waiter.resolve(message.params);
      else waiter.reject(new Error(message.params?.error || 'ChatGPT login failed'));
    }
  }

  for (const listener of listeners) listener(message);
}

function consume() {
  let index;
  while ((index = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (!line) continue;
    try { handleMessage(JSON.parse(line)); } catch (error) { console.error('Invalid Codex app-server JSON:', error.message); }
  }
}

function startProcess() {
  if (child && !child.killed) return;
  child = spawn(CODEX_BIN, ['app-server', '--listen', 'stdio://'], {
    env: { ...process.env, CODEX_HOME },
    stdio: ['pipe', 'pipe', 'pipe']
  });
  initialized = false;
  buffer = '';
  child.stdout.on('data', (chunk) => { buffer += chunk.toString(); consume(); });
  child.stderr.on('data', (chunk) => console.error(`[codex] ${chunk.toString().trimEnd()}`));
  child.on('exit', (code, signal) => {
    child = null;
    initialized = false;
    rejectAll(new Error(`Codex app-server stopped (code=${code}, signal=${signal})`));
  });
}

function request(method, params = {}) {
  startProcess();
  const id = String(nextId++);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Codex request timeout: ${method}`));
    }, REQUEST_TIMEOUT_MS);
    pending.set(id, {
      resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (error) => { clearTimeout(timer); reject(error); }
    });
    child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
  });
}

async function initialize() {
  if (initialized) return;
  await request('initialize', {
    clientInfo: { name: 'dnd-realm', title: 'D&D Realm AI bridge', version: '1.0.0' },
    capabilities: { experimentalApi: true }
  });
  child.stdin.write(`${JSON.stringify({ method: 'initialized' })}\n`);
  initialized = true;
}

export async function codexStatus() {
  await ensureConfig();
  await initialize();
  const account = await request('account/read', { refreshToken: true });
  if (account?.account?.type === 'chatgpt') return { ...account, requiresOpenaiAuth: false };
  return account;
}

export async function startChatGptDeviceLogin() {
  await ensureConfig();
  await initialize();
  return request('account/login/start', { type: 'chatgptDeviceCode' });
}

export async function waitForLogin(loginId) {
  return new Promise((resolve, reject) => {
    loginWaiters.set(loginId, { resolve, reject });
    setTimeout(() => {
      if (loginWaiters.delete(loginId)) reject(new Error('ChatGPT login timed out'));
    }, 10 * 60 * 1000);
  });
}

export async function codexPrompt({ system, user, campaignId, characterId }) {
  await ensureConfig();
  await initialize();

  const account = await request('account/read', { refreshToken: true });
  if (account?.account?.type !== 'chatgpt') {
    throw Object.assign(new Error('Codex is not authenticated with a ChatGPT account'), { status: 503, code: 'CODEX_AUTH_REQUIRED' });
  }

  const thread = await request('thread/start', {
    cwd: '/app',
    approvalPolicy: 'never',
    sandboxPolicy: { type: 'readOnly', networkAccess: true },
    personality: 'pragmatic'
  });
  const threadId = thread?.thread?.id;
  if (!threadId) throw new Error('Codex did not return a thread id');

  const prompt = `${system}\n\nCRITICAL STATE RULE: before producing the answer, call the D&D Realm MCP tool get_game_state with campaignId=${campaignId} and characterId=${characterId}, and treat its result as authoritative. Do not invent state.\n\nPLAYER REQUEST:\n${user}`;
  const turn = await request('turn/start', {
    threadId,
    input: [{ type: 'text', text: prompt }],
    approvalPolicy: 'never',
    sandboxPolicy: { type: 'readOnly', networkAccess: true }
  });
  const turnId = turn?.turn?.id;
  if (!turnId) throw new Error('Codex did not return a turn id');

  return await new Promise((resolve, reject) => {
    let text = '';
    const timeout = setTimeout(() => {
      listeners.delete(onMessage);
      reject(new Error('Codex turn timed out'));
    }, REQUEST_TIMEOUT_MS);
    const onMessage = (message) => {
      if (message.method === 'item/agentMessage/delta' && message.params?.turnId === turnId) text += message.params?.delta || '';
      if (message.method === 'item/completed' && message.params?.turnId === turnId && message.params?.item?.type === 'agentMessage') text = message.params.item.text || text;
      if (message.method === 'turn/completed' && message.params?.turnId === turnId) {
        clearTimeout(timeout);
        listeners.delete(onMessage);
        if (message.params?.turn?.status === 'failed') reject(new Error(message.params?.turn?.error?.message || 'Codex turn failed'));
        else resolve(text);
      }
    };
    listeners.add(onMessage);
  });
}

export function codexAuthRequiredError() {
  return Object.assign(new Error('ChatGPT authentication is required. Open /api/codex/login/start to start device login.'), { status: 503, code: 'CODEX_AUTH_REQUIRED' });
}

export async function shutdownCodex() {
  if (child) child.kill('SIGTERM');
  child = null;
  initialized = false;
}
