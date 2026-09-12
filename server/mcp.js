import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { pool } from './db.js';
import { config } from './config.js';

function assertAuth(req) {
  const expected = String(config.mcpToken || '').trim();
  if (!expected) throw Object.assign(new Error('DND_MCP_TOKEN is not configured'), { status: 503 });
  const actual = String(req.headers.authorization || '');
  if (actual !== `Bearer ${expected}`) throw Object.assign(new Error('Unauthorized'), { status: 401 });
}

function textResult(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value };
}

function createServer() {
  const server = new McpServer(
    { name: 'dnd-realm', version: '0.1.0' },
    { capabilities: { tools: {} }, instructions: 'Read-only access to the D&D Realm campaign state. Do not invent state that is not returned by tools.' }
  );

  server.registerTool('get_character', {
    title: 'Get character',
    description: 'Read one character from a D&D Realm campaign.',
    inputSchema: { campaignId: z.string().uuid(), characterId: z.string().uuid() }
  }, async ({ campaignId, characterId }) => {
    const { rows } = await pool.query(`
      SELECT id,campaign_id,user_id,kind,name,race,class_name,subclass,background,rank,level,xp,xp_next,
             hp,hp_max,temp_hp,armor_class,speed,initiative,proficiency_bonus,inspiration,
             spell_save_dc,spell_attack_bonus,hit_dice,death_saves,abilities,saving_throw_proficiencies,
             skill_proficiencies,proficiencies,languages,senses,traits,currency,updated_at
      FROM characters WHERE id=$1::uuid AND campaign_id=$2::uuid`, [characterId, campaignId]);
    if (!rows[0]) throw new Error('Character not found');
    return textResult(rows[0]);
  });

  server.registerTool('get_game_state', {
    title: 'Get game state',
    description: 'Read the current campaign state relevant to a character: character, inventory, active quests, current discoveries, and recent events.',
    inputSchema: { campaignId: z.string().uuid(), characterId: z.string().uuid(), recentEvents: z.number().int().min(1).max(50).default(15) }
  }, async ({ campaignId, characterId, recentEvents }) => {
    const character = (await pool.query(`SELECT id,campaign_id,name,race,class_name,subclass,background,level,xp,xp_next,hp,hp_max,temp_hp,armor_class,speed,initiative,proficiency_bonus,inspiration,abilities,skill_proficiencies,proficiencies,languages,traits,currency FROM characters WHERE id=$1::uuid AND campaign_id=$2::uuid`, [characterId, campaignId])).rows[0];
    if (!character) throw new Error('Character not found');

    const [inventory, quests, locations, creatures, sceneItems, events] = await Promise.all([
      pool.query(`SELECT ie.id AS inventory_entry_id,ie.quantity,ie.equipped,ie.attuned,ie.charges,ie.custom_name,ie.notes,i.id AS item_id,i.name,i.item_type,i.rarity,i.description,i.weight,i.base_value_gp,i.consumable,i.stackable,i.properties FROM inventory_entries ie JOIN items i ON i.id=ie.item_id WHERE ie.character_id=$1::uuid ORDER BY i.name`, [characterId]),
      pool.query(`SELECT q.id,q.title,q.description,q.status,q.recommended_level,q.reward,COALESCE(json_agg(json_build_object('id',qo.id,'title',qo.title,'current_value',qo.current_value,'target_value',qo.target_value,'optional',qo.optional,'completed',qo.completed) ORDER BY qo.sort_order) FILTER (WHERE qo.id IS NOT NULL),'[]') AS objectives FROM quests q LEFT JOIN quest_objectives qo ON qo.quest_id=q.id WHERE q.campaign_id=$1::uuid AND q.status IN ('AVAILABLE','ACTIVE') GROUP BY q.id ORDER BY q.created_at`, [campaignId]),
      pool.query(`SELECT ke.subject_id AS id,l.name,l.description,ke.level,ke.facts,l.visited FROM knowledge_entries ke JOIN locations l ON l.id=ke.subject_id WHERE ke.character_id=$1::uuid AND ke.subject_type='LOCATION' ORDER BY l.name`, [characterId]),
      pool.query(`SELECT ke.subject_id AS id,c.name,c.creature_type,c.challenge_rating,c.armor_class,c.hp_average,ke.level,ke.facts FROM knowledge_entries ke JOIN creatures c ON c.id=ke.subject_id WHERE ke.character_id=$1::uuid AND ke.subject_type='CREATURE' ORDER BY c.name`, [characterId]),
      pool.query(`SELECT id,name,description,item_spec,status,created_at FROM scene_items WHERE character_id=$1::uuid AND status='AVAILABLE' ORDER BY created_at DESC`, [characterId]),
      pool.query(`SELECT id,sequence,event_type,aggregate_type,aggregate_id,payload,created_at FROM game_events WHERE campaign_id=$1::uuid ORDER BY sequence DESC LIMIT $2`, [campaignId, recentEvents])
    ]);

    return textResult({ character, inventory: inventory.rows, quests: quests.rows, knownLocations: locations.rows, knownCreatures: creatures.rows, availableSceneItems: sceneItems.rows, recentEvents: events.rows.reverse() });
  });

  server.registerTool('get_recent_history', {
    title: 'Get recent history',
    description: 'Read recent player and master messages for one character. Use this instead of requesting the whole message history.',
    inputSchema: { campaignId: z.string().uuid(), characterId: z.string().uuid(), limit: z.number().int().min(1).max(50).default(20) }
  }, async ({ campaignId, characterId, limit }) => {
    const { rows } = await pool.query(`SELECT id,role,body,metadata,created_at FROM messages WHERE campaign_id=$1::uuid AND character_id=$2::uuid ORDER BY created_at DESC LIMIT $3`, [campaignId, characterId, limit]);
    return textResult(rows.reverse());
  });

  return server;
}

export function mountMcp(app) {
  if (!config.mcpEnabled) return;

  app.get('/mcp/health', (req, res) => res.json({ ok: true, service: 'dnd-realm-mcp' }));

  app.all('/mcp', async (req, res) => {
    try {
      assertAuth(req);
      const server = createServer();
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on('close', () => { void transport.close(); void server.close(); });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      const status = error.status || 500;
      if (!res.headersSent) res.status(status).json({ error: error.message });
    }
  });
}
