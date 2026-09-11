import { Router } from 'express';
import { z } from 'zod';
import { pool, transaction } from './db.js';
import { derivedCharacter } from './rules.js';

export const playerApi = Router();

const DEFAULT_CAMPAIGN_ID = '10000000-0000-4000-8000-000000000001';

async function getCharacter(id, campaignId) {
  const { rows } = await pool.query(
    "SELECT * FROM characters WHERE id=$1 AND campaign_id=$2 AND kind='PLAYER'",
    [id, campaignId]
  );
  if (!rows[0]) throw Object.assign(new Error('Персонаж не найден в этой кампании'), { status: 404 });
  return rows[0];
}

async function summary(id, campaignId) {
  const character = await getCharacter(id, campaignId);
  const [effects, inventory] = await Promise.all([
    pool.query('SELECT * FROM effects WHERE target_character_id=$1 AND campaign_id=$2 AND active ORDER BY started_at DESC', [id, campaignId]),
    pool.query(`
      SELECT ie.id,ie.quantity,ie.equipped,ie.attuned,ie.charges,
             COALESCE(ie.custom_name,i.name) name,i.item_type,i.rarity,i.description,i.properties,
             COALESCE(json_agg(d.property_key) FILTER (WHERE d.property_key IS NOT NULL),'[]') discovered_properties
      FROM inventory_entries ie
      JOIN items i ON i.id=ie.item_id
      LEFT JOIN item_discoveries d ON d.inventory_entry_id=ie.id
      WHERE ie.character_id=$1
      GROUP BY ie.id,i.id
      ORDER BY i.name`, [id])
  ]);
  const safeInventory = inventory.rows.map((entry) => {
    const discovered = new Set(entry.discovered_properties || []);
    const properties = Array.isArray(entry.properties)
      ? entry.properties.filter((property) => property?.secret !== true || discovered.has(property.key))
      : [];
    return { ...entry, properties, discovered_properties: [...discovered] };
  });
  return { ...derivedCharacter({ ...character, effects: effects.rows, inventory: safeInventory }) };
}

async function loadState(req, res) {
  const campaignId = z.string().uuid().parse(req.query.campaignId || DEFAULT_CAMPAIGN_ID);
  const characterId = req.query.characterId ? z.string().uuid().parse(req.query.characterId) : null;

  const campaignResult = await pool.query('SELECT * FROM campaigns WHERE id=$1', [campaignId]);
  if (!campaignResult.rows[0]) throw Object.assign(new Error('Кампания не найдена'), { status: 404 });

  const character = characterId ? await summary(characterId, campaignId) : null;
  const [party, quests, locations, messages, journal, events, bestiary] = await Promise.all([
    pool.query(`
      SELECT c.*,COALESCE(json_agg(e.*) FILTER(WHERE e.id IS NOT NULL),'[]') effects
      FROM party_members p
      JOIN characters c ON c.id=p.character_id
      LEFT JOIN effects e ON e.target_character_id=c.id AND e.active
      WHERE p.campaign_id=$1 AND p.active AND c.kind IN ('PLAYER','COMPANION','MERCENARY')
      GROUP BY c.id
      ORDER BY MIN(p.joined_at)`, [campaignId]),
    pool.query(`
      SELECT q.*,COALESCE(json_agg(o.* ORDER BY o.sort_order) FILTER(WHERE o.id IS NOT NULL),'[]') objectives
      FROM quests q
      LEFT JOIN quest_objectives o ON o.quest_id=q.id
      WHERE q.campaign_id=$1
      GROUP BY q.id
      ORDER BY q.status,q.title`, [campaignId]),
    characterId
      ? pool.query(`
          SELECT l.*,
                 k.level AS knowledge_level,
                 COALESCE(k.facts,'[]'::jsonb) AS knowledge_facts
          FROM locations l
          JOIN knowledge_entries k ON k.subject_id=l.id
          WHERE l.campaign_id=$1
            AND k.campaign_id=$1
            AND k.character_id=$2
            AND k.subject_type='LOCATION'
            AND k.level<>'UNKNOWN'
          ORDER BY l.name`, [campaignId, characterId])
      : Promise.resolve({ rows: [] }),
    characterId
      ? pool.query(`
          SELECT * FROM messages
          WHERE campaign_id=$1 AND (character_id=$2 OR (role='SYSTEM' AND character_id IS NULL))
          ORDER BY created_at ASC LIMIT 100`, [campaignId, characterId])
      : Promise.resolve({ rows: [] }),
    characterId
      ? pool.query(`
          SELECT * FROM journal_entries
          WHERE campaign_id=$1 AND (author_character_id=$2 OR author_character_id IS NULL)
          ORDER BY created_at DESC LIMIT 100`, [campaignId, characterId])
      : Promise.resolve({ rows: [] }),
    characterId
      ? pool.query(`
          SELECT * FROM game_events
          WHERE campaign_id=$1
            AND (actor_character_id=$2::uuid OR (aggregate_type='CHARACTER' AND aggregate_id=$2::uuid))
          ORDER BY sequence DESC LIMIT 100`, [campaignId, characterId])
      : Promise.resolve({ rows: [] }),
    characterId
      ? pool.query(`
          SELECT cr.id,cr.name,cr.creature_type,cr.challenge_rating,k.level,k.facts,
                 CASE WHEN k.level IN ('STUDIED','COMPLETE') THEN cr.public_data ELSE '{}'::jsonb END details
          FROM knowledge_entries k
          JOIN creatures cr ON cr.id=k.subject_id
          WHERE k.campaign_id=$1
            AND k.character_id=$2
            AND k.subject_type='CREATURE'
            AND k.level<>'UNKNOWN'
          ORDER BY cr.name`, [campaignId, characterId])
      : Promise.resolve({ rows: [] })
  ]);

  res.json({
    campaign: campaignResult.rows[0],
    character,
    party: party.rows,
    quests: quests.rows,
    locations: locations.rows,
    messages: messages.rows,
    journal: journal.rows,
    events: events.rows.reverse(),
    bestiary: bestiary.rows
  });
}

playerApi.get('/bootstrap', async (req,res) => loadState(req,res));

playerApi.get('/events', async (req,res) => {
  const campaignId = z.string().uuid().parse(req.query.campaignId || DEFAULT_CAMPAIGN_ID);
  const characterId = z.string().uuid().parse(req.query.characterId);
  await getCharacter(characterId, campaignId);
  const { rows } = await pool.query(`
    SELECT * FROM game_events
    WHERE campaign_id=$1 AND (actor_character_id=$2::uuid OR (aggregate_type='CHARACTER' AND aggregate_id=$2::uuid))
    ORDER BY sequence`, [campaignId, characterId]);
  res.json(rows);
});

playerApi.get('/messages', async (req,res) => {
  const campaignId = z.string().uuid().parse(req.query.campaignId || DEFAULT_CAMPAIGN_ID);
  const characterId = z.string().uuid().parse(req.query.characterId);
  await getCharacter(characterId, campaignId);
  const { rows } = await pool.query(`
    SELECT * FROM messages
    WHERE campaign_id=$1 AND (character_id=$2 OR (role='SYSTEM' AND character_id IS NULL))
    ORDER BY created_at`, [campaignId, characterId]);
  res.json(rows);
});

playerApi.get('/journal', async (req,res) => {
  const campaignId = z.string().uuid().parse(req.query.campaignId || DEFAULT_CAMPAIGN_ID);
  const characterId = z.string().uuid().parse(req.query.characterId);
  await getCharacter(characterId, campaignId);
  const { rows } = await pool.query(`
    SELECT * FROM journal_entries
    WHERE campaign_id=$1 AND (author_character_id=$2 OR author_character_id IS NULL)
    ORDER BY created_at DESC`, [campaignId, characterId]);
  res.json(rows);
});

playerApi.post('/messages', async (req,res) => {
  const input = z.object({
    campaignId:z.string().uuid(),
    characterId:z.string().uuid(),
    body:z.string().trim().min(1).max(4000)
  }).parse(req.body);
  const result = await transaction(async (client) => {
    const character = (await client.query(
      "SELECT * FROM characters WHERE id=$1 AND campaign_id=$2 AND kind='PLAYER' FOR SHARE",
      [input.characterId,input.campaignId]
    )).rows[0];
    if (!character) throw Object.assign(new Error('Активный персонаж не найден в этой кампании'), {status:404});

    const player = (await client.query(
      `INSERT INTO messages(campaign_id,character_id,role,body)
       VALUES($1,$2,'PLAYER',$3) RETURNING *`,
      [input.campaignId,input.characterId,input.body]
    )).rows[0];

    const recent = (await client.query(
      `SELECT role,body FROM messages
       WHERE campaign_id=$1 AND character_id=$2
       ORDER BY created_at DESC LIMIT 8`,
      [input.campaignId,input.characterId]
    )).rows.reverse();

    const masterText = `${character.name} действует. Мастер учитывает характеристики, HP ${character.hp}/${character.hp_max}, КД ${character.armor_class}, инвентарь, активные эффекты, известные локации, бестиарий и предыдущие события. Намерение персонажа: «${input.body}». Результат действия должен быть проведён через игровой движок и отражён в состоянии героя.`;
    const master = (await client.query(
      `INSERT INTO messages(campaign_id,character_id,role,body,metadata)
       VALUES($1,$2,'MASTER',$3,$4) RETURNING *`,
      [input.campaignId,input.characterId,masterText,{engine:'local-rules',characterId:input.characterId,recentTurns:recent.length}]
    )).rows[0];

    await client.query(`
      INSERT INTO game_events(campaign_id,actor_character_id,event_type,aggregate_type,aggregate_id,payload)
      VALUES($1,$2,'PLAYER_ACTION','MESSAGE',$3,$4)`,
      [input.campaignId,input.characterId,player.id,{text:input.body,responseId:master.id}]
    );

    await client.query(`
      INSERT INTO journal_entries(campaign_id,author_character_id,entry_type,title,body,tags)
      VALUES($1,$2,'EVENT',$3,$4,$5)`,
      [input.campaignId,input.characterId,'Действие: '+input.body.slice(0,80),masterText,['чат','действие']]
    );

    return {player,master};
  });
  res.status(201).json(result);
});
