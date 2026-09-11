import { Router } from 'express';
import { z } from 'zod';
import { pool, transaction } from './db.js';
import { derivedCharacter } from './rules.js';

export const playerApi = Router();

async function summary(id) {
  const { rows } = await pool.query('SELECT * FROM characters WHERE id=$1 AND kind=\'PLAYER\'', [id]);
  if (!rows[0]) throw Object.assign(new Error('Персонаж не найден'), { status:404 });
  const [effects, inventory] = await Promise.all([
    pool.query('SELECT * FROM effects WHERE target_character_id=$1 AND active ORDER BY started_at DESC', [id]),
    pool.query(`SELECT ie.id,ie.quantity,ie.equipped,ie.attuned,ie.charges,COALESCE(ie.custom_name,i.name) name,i.item_type,i.rarity,i.description,i.properties,
      COALESCE(json_agg(d.property_key) FILTER (WHERE d.property_key IS NOT NULL),'[]') discovered_properties
      FROM inventory_entries ie JOIN items i ON i.id=ie.item_id LEFT JOIN item_discoveries d ON d.inventory_entry_id=ie.id
      WHERE ie.character_id=$1 GROUP BY ie.id,i.id ORDER BY i.name`, [id])
  ]);
  return { ...derivedCharacter(rows[0]), effects: effects.rows, inventory: inventory.rows };
}

async function bootstrap(req,res) {
  const campaignId = String(req.query.campaignId || '10000000-0000-4000-8000-000000000001');
  const characterId = String(req.query.characterId || '').trim();
  const character = characterId ? await summary(characterId) : null;
  const [campaign, party, quests, locations, messages, journal, bestiary] = await Promise.all([
    pool.query('SELECT * FROM campaigns WHERE id=$1', [campaignId]),
    pool.query(`SELECT c.*,COALESCE(json_agg(e.*) FILTER(WHERE e.id IS NOT NULL),'[]') effects
      FROM party_members p JOIN characters c ON c.id=p.character_id
      LEFT JOIN effects e ON e.target_character_id=c.id AND e.active
      WHERE p.campaign_id=$1 AND p.active GROUP BY c.id ORDER BY p.joined_at`, [campaignId]),
    pool.query(`SELECT q.*,COALESCE(json_agg(o.* ORDER BY o.sort_order) FILTER(WHERE o.id IS NOT NULL),'[]') objectives
      FROM quests q LEFT JOIN quest_objectives o ON o.quest_id=q.id WHERE q.campaign_id=$1 GROUP BY q.id ORDER BY q.status,q.title`, [campaignId]),
    pool.query('SELECT * FROM locations WHERE campaign_id=$1 AND discovered ORDER BY name', [campaignId]),
    characterId ? pool.query('SELECT * FROM messages WHERE campaign_id=$1 AND character_id=$2 ORDER BY created_at', [campaignId,characterId]) : Promise.resolve({rows:[]}),
    characterId ? pool.query('SELECT * FROM journal_entries WHERE campaign_id=$1 AND author_character_id=$2 ORDER BY created_at DESC', [campaignId,characterId]) : Promise.resolve({rows:[]}),
    characterId ? pool.query(`SELECT cr.id,cr.name,cr.creature_type,cr.challenge_rating,k.level,k.facts,
      CASE WHEN k.level IN ('STUDIED','COMPLETE') THEN cr.public_data ELSE '{}'::jsonb END details
      FROM knowledge_entries k JOIN creatures cr ON cr.id=k.subject_id
      WHERE k.campaign_id=$1 AND k.character_id=$2 AND k.subject_type='CREATURE' AND k.level<>'UNKNOWN'`, [campaignId,characterId]) : Promise.resolve({rows:[]})
  ]);
  if (!campaign.rows[0]) throw Object.assign(new Error('Кампания не найдена'), {status:404});
  if (character && String(character.id) !== characterId) throw Object.assign(new Error('Персонаж не принадлежит текущей кампании'), {status:404});
  res.json({ campaign:campaign.rows[0], character, party:party.rows, quests:quests.rows, locations:locations.rows, messages:messages.rows, journal:journal.rows, bestiary:bestiary.rows });
}

playerApi.get('/bootstrap', async (req,res) => bootstrap(req,res));

playerApi.get('/events', async (req,res) => {
  const campaignId = String(req.query.campaignId || '10000000-0000-4000-8000-000000000001');
  const characterId = String(req.query.characterId || '').trim();
  if (!characterId) return res.json([]);
  const { rows } = await pool.query('SELECT * FROM game_events WHERE campaign_id=$1 AND actor_character_id=$2 ORDER BY sequence', [campaignId,characterId]);
  res.json(rows);
});

playerApi.get('/messages', async (req,res) => {
  const campaignId = String(req.query.campaignId || '10000000-0000-4000-8000-000000000001');
  const characterId = String(req.query.characterId || '').trim();
  if (!characterId) return res.json([]);
  const { rows } = await pool.query('SELECT * FROM messages WHERE campaign_id=$1 AND character_id=$2 ORDER BY created_at', [campaignId,characterId]);
  res.json(rows);
});

playerApi.get('/journal', async (req,res) => {
  const campaignId = String(req.query.campaignId || '10000000-0000-4000-8000-000000000001');
  const characterId = String(req.query.characterId || '').trim();
  if (!characterId) return res.json([]);
  const { rows } = await pool.query('SELECT * FROM journal_entries WHERE campaign_id=$1 AND author_character_id=$2 ORDER BY created_at DESC', [campaignId,characterId]);
  res.json(rows);
});

playerApi.post('/messages', async (req,res) => {
  const input = z.object({ campaignId:z.string().uuid(), characterId:z.string().uuid(), body:z.string().trim().min(1).max(4000) }).parse(req.body);
  const result = await transaction(async (client) => {
    const character = (await client.query('SELECT id FROM characters WHERE id=$1 AND campaign_id=$2 AND kind=\'PLAYER\'', [input.characterId,input.campaignId])).rows[0];
    if (!character) throw Object.assign(new Error('Активный персонаж не найден'), {status:404});
    const player = (await client.query(`INSERT INTO messages(campaign_id,character_id,role,body) VALUES($1,$2,'PLAYER',$3) RETURNING *`, [input.campaignId,input.characterId,input.body])).rows[0];
    const masterText = `Вы заявили: «${input.body}». Мастер учитывает состояние героя, характеристики, инвентарь, активные эффекты, локацию и последствия предыдущих событий. Если действие рискованно — система назначит подходящую проверку.`;
    const master = (await client.query(`INSERT INTO messages(campaign_id,character_id,role,body,metadata) VALUES($1,$2,'MASTER',$3,$4) RETURNING *`, [input.campaignId,input.characterId,masterText,{engine:'local-rules',characterId:input.characterId}])).rows[0];
    await client.query(`INSERT INTO game_events(campaign_id,actor_character_id,event_type,aggregate_type,aggregate_id,payload)
      VALUES($1,$2,'PLAYER_ACTION','MESSAGE',$3,$4)`, [input.campaignId,input.characterId,player.id,{text:input.body,responseId:master.id}]);
    return {player,master};
  });
  res.status(201).json(result);
});
