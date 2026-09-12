import 'dotenv/config';

const aiProvider = String(process.env.AI_PROVIDER || (process.env.OPENROUTER_API_KEY ? 'openrouter' : 'codex')).toLowerCase();
const useOpenRouter = aiProvider === 'openrouter';
const useCodex = aiProvider === 'codex';
const aiApiKey = useCodex ? (process.env.DND_MCP_TOKEN || '') : (useOpenRouter ? (process.env.OPENROUTER_API_KEY || '') : (process.env.OPENAI_API_KEY || ''));
const aiBaseUrl = useCodex
  ? `http://127.0.0.1:${Number(process.env.PORT || 3000)}/internal-ai`
  : (useOpenRouter ? (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1') : (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'));
const aiModel = useCodex
  ? (process.env.CODEX_MODEL || 'codex-default')
  : (useOpenRouter ? (process.env.OPENROUTER_MODEL || 'openrouter/free') : (process.env.OPENAI_MODEL || 'gpt-5.6-luna'));

export const config = {
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.DATABASE_URL || 'postgres://dnd:dnd@localhost:5432/dnd_realm',
  databaseSsl: process.env.DATABASE_SSL === 'true',
  databaseConnectTimeoutMs: Number(process.env.DATABASE_CONNECT_TIMEOUT_MS || 5000),
  databaseStatementTimeoutMs: Number(process.env.DATABASE_STATEMENT_TIMEOUT_MS || 10000),
  autoMigrate: process.env.AUTO_MIGRATE !== 'false',
  seedDemo: process.env.SEED_DEMO !== 'false',
  defaultCampaignId: process.env.DEFAULT_CAMPAIGN_ID || '10000000-0000-4000-8000-000000000001',
  defaultCharacterId: process.env.DEFAULT_CHARACTER_ID || '30000000-0000-4000-8000-000000000001',
  mcpEnabled: process.env.DND_MCP_ENABLED !== 'false',
  mcpToken: process.env.DND_MCP_TOKEN || '',
  mcpOAuthEnabled: process.env.DND_MCP_OAUTH_ENABLED !== 'false',
  mcpOAuthSecret: process.env.DND_MCP_OAUTH_SECRET || process.env.DND_MCP_TOKEN || '',
  mcpOAuthSetupCode: process.env.DND_MCP_OAUTH_SETUP_CODE || process.env.DND_MCP_TOKEN || '',
  aiProvider,
  aiApiKey,
  aiBaseUrl,
  aiModel,
  codexHome: process.env.CODEX_HOME || '/data/codex'
};
