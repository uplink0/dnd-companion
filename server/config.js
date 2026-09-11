import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.DATABASE_URL || 'postgres://dnd:dnd@localhost:5432/dnd_realm',
  databaseSsl: process.env.DATABASE_SSL === 'true',
  autoMigrate: process.env.AUTO_MIGRATE !== 'false',
  seedDemo: process.env.SEED_DEMO !== 'false',
  defaultCampaignId: process.env.DEFAULT_CAMPAIGN_ID || '10000000-0000-4000-8000-000000000001',
  defaultCharacterId: process.env.DEFAULT_CHARACTER_ID || '30000000-0000-4000-8000-000000000001'
};
