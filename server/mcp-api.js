import { Router } from 'express';
import { z } from 'zod';
import { pool } from './db.js';
import { characterSummary } from './character-api.js';
import { config } from './config.js';

export const mcpApi = Router();

const TOOLS = [
  {
    name: 'get_character',
    description: 'Read the current character state for a campaign.',
    inputSchema: {
      type: 'object',
      properties: {
        campaignId: { type: 'string', format: 'uuid' },
        characterId: { type: 'string', format: 'uuid' }
      },
      required: ['campaignId', 'characterId'],
      additionalProperties: false
    }
  },
  {
    name: 'get_game_state',
    description: 'Read the consistent campaign state for a character.',
    inputSchema: {
      type: 'object',
      properties: {
        campaignId: { type: 'string', format: 'uuid' },
        characterId: { type: 'string', format: 'uuid' },
        recentEvents: { type: 'integer', minimum: 1, maximum: 100 }
      },
      required: ['campaignId', 'characterId'],
      additionalProperties: false
    }
  },
  {
    name: 'get_recent_history',
    description: 'Read recent chat and game-event history for a character.',
    inputSchema: {
      type: 'object',
      properties: {
        campaignId: { type: 'string', format: 'uuid' },
        characterId: { type: 'string', format: 'uuid' },
        limit: { type: 'integer', minimum: 1, maximum: 100 }
      },
      required: ['campaignId', 'characterId'],
      additionalProperties: false
    }
  }
];

function auth(req) {
  const expected = process.env.DND_MCP_TOKEN;
  const actual = String(req.headers.authorization || '');
  return Boolean(expected && actual === `Bearer ${expected}`);
}

function rpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function rpcError(id, code, message) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

function ids(args) {
  return z.object({ campaignId: z.string().uuid(), characterId: z.string().uuid() }).parse(args);
}

async function getCharacter(campaignId, characterId) {
  return characterSummary(characterId, campaignId);
}

async function getGameState(campaignId, characterId, recentEvents = 15) {
  const character = await getCharacter(campaignId, characterId);
  const [campaign, party, quests, locations, messages, journal, events, bestiary] = await Promise.all([
    pool.query('SELECT * FROM campaigns WHERE id=$1::uuid', [campaignId]),
    pool.query(`
      SELECT c.*,COALESCE(json_agg(e.*) FILTER(WHERE e.id IS NOT NULL),'[]') effects
      FROM party_members p JOIN characters c ON c.id=p.character_id
      LEFT JOIN effects e ON e.target_character_id=c.id AND e.active
      WHERE p.campaign_id=$1::uuid AND p.active AND c.kind IN ('PLAYER','COMPANION','MERCENARY')
      GROUP BY c.id ORDER BY MIN(p.joined_at)`, [campaignId]),
    pool.query(`
      SELECT q.*,COALESCE(json_agg(o.* ORDER BY o.sort_order) FILTER(WHERE o.id IS NOT NULL),'[]') objectives
      FROM quests q LEFT JOIN quest_objectives o ON o.quest_id=q.id
      WHERE q.campaign_id=$1::uuid GROUP BY q.id ORDER BY q.status,q.title`, [campaignId]),
    pool.query(`
      SELECT l.*,k.level AS knowledge_level,COALESCE(k.facts,'[]'::jsonb) knowledge_facts
      FROM locations l JOIN knowledge_entries k ON k.subject_id=l.id
      WHERE l.campaign_id=$1::uuid AND k.campaign_id=$1::uuid AND k.character_id=$2::uuid
        AND k.subject_type='LOCATION' AND k.level<>'UNKNOWN' ORDER BY l.name`, [campaignId, characterId]),
    pool.query(`SELECT * FROM messages WHERE campaign_id=$1::uuid AND (character_id=$2::uuid OR (role='SYSTEM' AND character_id IS NULL)) ORDER BY created_at DESC LIMIT 100`, [campaignId, characterId]),
    pool.query(`SELECT * FROM journal_entries WHERE campaign_id=$1::uuid AND (author_character_id=$2::uuid OR author_character_id IS NULL) ORDER BY created_at DESC LIMIT 100`, [campaignId, characterId]),
    pool.query(`SELECT * FROM game_events WHERE campaign_id=$1::uuid AND (actor_character_id=$2::uuid OR (aggregate_type='CHARACTER' AND aggregate_id=$2::uuid)) ORDER BY sequence DESC LIMIT $3`, [campaignId, characterId, recentEvents]),
    pool.query(`
      SELECT cr.id,cr.name,cr.creature_type,cr.challenge_rating,k.level,k.facts,
             CASE WHEN k.level IN ('STUDIED','COMPLETE') THEN cr.public_data ELSE '{}'::jsonb END details
      FROM knowledge_entries k JOIN creatures cr ON cr.id=k.subject_id
      WHERE k.campaign_id=$1::uuid AND k.character_id=$2::uuid AND k.subject_type='CREATURE' AND k.level<>'UNKNOWN'
      ORDER BY cr.name`, [campaignId, characterId])
  ]);
  if (!campaign.rows[0]) throw Object.assign(new Error('Кампания не найдена'), { status: 404 });
  return {
    campaign: campaign.rows[0], character, party: party.rows, quests: quests.rows,
    locations: locations.rows, messages: messages.rows.reverse(), journal: journal.rows,
    events: events.rows.reverse(), bestiary: bestiary.rows
  };
}

async function getRecentHistory(campaignId, characterId, limit = 20) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  const [messages, events] = await Promise.all([
    pool.query(`SELECT * FROM messages WHERE campaign_id=$1::uuid AND character_id=$2::uuid ORDER BY created_at DESC LIMIT $3`, [campaignId, characterId, safeLimit]),
    pool.query(`SELECT * FROM game_events WHERE campaign_id=$1::uuid AND (actor_character_id=$2::uuid OR (aggregate_type='CHARACTER' AND aggregate_id=$2::uuid)) ORDER BY sequence DESC LIMIT $3`, [campaignId, characterId, safeLimit])
  ]);
  return { messages: messages.rows.reverse(), events: events.rows.reverse() };
}

mcpApi.all('/', async (req, res) => {
  if (!auth(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method === 'GET') return res.status(405).set('Allow', 'POST').end();
  if (req.method !== 'POST') return res.status(405).end();

  const request = req.body || {};
  const id = request.id;
  const method = request.method;

  try {
    if (method === 'initialize') {
      return res.json(rpcResult(id, {
        protocolVersion: request.params?.protocolVersion || '2025-06-18',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'dnd-realm', version: '0.1.1' },
        instructions: 'Read-only access to the D&D Realm campaign state. Do not invent state that is not returned by tools.'
      }));
    }

    if (method === 'notifications/initialized') return res.status(202).end();

    if (method === 'ping') return res.json(rpcResult(id, {}));

    if (method === 'tools/list') {
      return res.json(rpcResult(id, { tools: TOOLS }));
    }

    if (method === 'tools/call') {
      const name = request.params?.name;
      const args = request.params?.arguments || {};
      let value;
      if (name === 'get_character') {
        const { campaignId, characterId } = ids(args);
        value = await getCharacter(campaignId, characterId);
      } else if (name === 'get_game_state') {
        const { campaignId, characterId } = ids(args);
        value = await getGameState(campaignId, characterId, Math.max(1, Math.min(100, Number(args.recentEvents) || 15)));
      } else if (name === 'get_recent_history') {
        const { campaignId, characterId } = ids(args);
        value = await getRecentHistory(campaignId, characterId, args.limit);
      } else {
        return res.status(404).json(rpcError(id, -32601, `Unknown tool: ${name}`));
      }
      return res.json(rpcResult(id, { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value }));
    }

    return res.status(404).json(rpcError(id, -32601, `Method not found: ${method}`));
  } catch (error) {
    const status = error.status || (error instanceof z.ZodError ? 400 : 500);
    return res.status(status).json(rpcError(id, -32603, error.message));
  }
});
