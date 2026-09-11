import { Router } from 'express';
import { z } from 'zod';
import { pool, transaction } from './db.js';
import { config } from './config.js';
import { derivedCharacter } from './rules.js';
import {
  BACKGROUNDS,
  CLASSES,
  RACES,
  STAT_KEYS,
  deriveStats,
  generateDraft,
  validateBaseAbilities
} from './character-rules.js';

export const characterApi = Router();

function publicOptions() {
  return {
    races: Object.fromEntries(Object.entries(RACES)),
    classes: Object.fromEntries(
      Object.entries(CLASSES).map(([name, data]) => [name, {
        hitDie: data.hitDie,
        spellAbility: data.spellAbility,
        bonuses: data.bonuses
      }])
    ),
    backgrounds: BACKGROUNDS,
    statKeys: STAT_KEYS
  };
}

function validateCharacterInput(body) {
  return z.object({
    campaignId: z.string().uuid(),
    name: z.string().trim().min(2).max(80),
    race: z.string().refine((value) => value in RACES, 'Неизвестная раса'),
    className: z.string().refine((value) => value in CLASSES, 'Неизвестный класс'),
    background: z.string().trim().max(120).optional(),
    biography: z.string().trim().max(2000).optional(),
    abilities: z.record(z.number().int())
  }).parse(body);
}

export async function characterSummary(id, campaignId = null) {
  const query = campaignId
    ? 'SELECT * FROM characters WHERE id=$1::uuid AND campaign_id=$2::uuid'
    : 'SELECT * FROM characters WHERE id=$1::uuid';
  const params = campaignId ? [id, campaignId] : [id];
  const { rows } = await pool.query(query, params);
  if (!rows[0]) throw Object.assign(new Error('Персонаж не найден в этой кампании'), { status: 404 });

  const [effects, inventory] = await Promise.all([
    pool.query('SELECT * FROM effects WHERE target_character_id=$1::uuid AND campaign_id=$2::uuid AND active ORDER BY started_at DESC', [id, campaignId || rows[0].campaign_id]),
    pool.query(`
      SELECT ie.id,ie.quantity,ie.equipped,ie.attuned,ie.charges,
             COALESCE(ie.custom_name,i.name) name,i.item_type,i.rarity,i.description,i.properties,
             COALESCE(json_agg(d.property_key) FILTER (WHERE d.property_key IS NOT NULL),'[]') discovered_properties
      FROM inventory_entries ie
      JOIN items i ON i.id=ie.item_id
      LEFT JOIN item_discoveries d ON d.inventory_entry_id=ie.id
      WHERE ie.character_id=$1::uuid
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

  return derivedCharacter({ ...rows[0], effects: effects.rows, inventory: safeInventory });
}

async function createCharacter(input) {
  const baseAbilities = validateBaseAbilities(input.abilities);
  const stats = deriveStats(baseAbilities, input.race, input.className);

  return transaction(async (client) => {
    const campaign = (await client.query('SELECT owner_id FROM campaigns WHERE id=$1::uuid', [input.campaignId])).rows[0];
    if (!campaign) throw Object.assign(new Error('Кампания не найдена'), { status: 404 });

    const result = (await client.query(`
      INSERT INTO characters(
        campaign_id,user_id,kind,name,race,class_name,background,rank,level,xp,xp_next,
        hp,hp_max,armor_class,initiative,proficiency_bonus,spell_save_dc,spell_attack_bonus,
        hit_dice,abilities,biography
      )
      VALUES($1::uuid,$2::uuid,'PLAYER',$3,$4,$5,$6,'Новичок',1,0,300,$7,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING *`, [
      input.campaignId,
      campaign.owner_id,
      input.name,
      input.race,
      input.className,
      input.background || '',
      stats.hpMax,
      stats.armorClass,
      stats.initiative,
      stats.proficiencyBonus,
      stats.spellSaveDc,
      stats.spellAttackBonus,
      stats.hitDice,
      stats.abilities,
      input.biography || `Герой ${input.name} начинает свой путь в неизвестности.`
    ])).rows[0];

    await client.query(
      `INSERT INTO party_members(campaign_id,character_id,recruitment_type)
       VALUES($1::uuid,$2::uuid,'START')
       ON CONFLICT(campaign_id,character_id) DO UPDATE SET active=true`,
      [input.campaignId, result.id]
    );

    const startingLocation = (await client.query(`
      SELECT id FROM locations
      WHERE campaign_id=$1::uuid AND discovered
      ORDER BY visited DESC, name
      LIMIT 1`, [input.campaignId])).rows[0];

    if (startingLocation) {
      await client.query(`
        INSERT INTO knowledge_entries(campaign_id,character_id,subject_type,subject_id,level,facts)
        VALUES($1::uuid,$2::uuid,'LOCATION',$3::uuid,'SEEN','[]'::jsonb)
        ON CONFLICT(character_id,subject_type,subject_id) DO NOTHING`,
        [input.campaignId, result.id, startingLocation.id]
      );
    }

    await client.query(`
      INSERT INTO game_events(campaign_id,actor_character_id,event_type,aggregate_type,aggregate_id,payload)
      VALUES($1::uuid,$2::uuid,'CHARACTER_CREATED','CHARACTER',$2::uuid,$3)`, [
      input.campaignId,
      result.id,
      {
        name: result.name,
        race: result.race,
        className: result.class_name,
        baseAbilities,
        raceBonuses: RACES[input.race],
        classBonuses: CLASSES[input.className].bonuses,
        startingLocationId: startingLocation?.id || null
      }
    ]);

    return result;
  });
}

characterApi.get('/options', (req, res) => res.json(publicOptions()));

characterApi.get('/:id/summary', async (req, res) => {
  const campaignId = z.string().uuid().parse(req.query.campaignId);
  res.json(await characterSummary(req.params.id, campaignId));
});

characterApi.get('/', async (req, res) => {
  const campaignId = z.string().uuid().parse(req.query.campaignId || config.defaultCampaignId);
  const { rows } = await pool.query(`
    SELECT id,campaign_id,kind,name,race,class_name,rank,level,xp,xp_next,hp,hp_max,
           armor_class,initiative,proficiency_bonus,spell_save_dc,spell_attack_bonus,
           hit_dice,abilities,biography,created_at
    FROM characters
    WHERE campaign_id=$1::uuid AND kind='PLAYER'
    ORDER BY created_at`, [campaignId]);
  res.json(rows.map(derivedCharacter));
});

characterApi.post('/generate', (req, res) => res.json(generateDraft()));

characterApi.post('/', async (req, res) => {
  const input = validateCharacterInput(req.body);
  const character = await createCharacter(input);
  res.status(201).json({
    ...derivedCharacter(character),
    baseAbilities: validateBaseAbilities(input.abilities),
    raceBonuses: RACES[input.race],
    classBonuses: CLASSES[input.className].bonuses
  });
});
