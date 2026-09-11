import 'dotenv/config';

const aiApiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || '';
const aiBaseUrl = process.env.OPENAI_BASE_URL || (process.env.OPENROUTER_API_KEY ? 'https://openrouter.ai/api/v1' : 'https://api.openai.com/v1');
const aiModel = process.env.OPENAI_MODEL || (process.env.OPENROUTER_API_KEY ? 'openrouter/free' : 'gpt-5.6-luna');

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
  aiApiKey,
  aiBaseUrl,
  aiModel
};
