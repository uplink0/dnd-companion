import { transaction } from './db.js';
import { rollDice } from './rules.js';

async function event(client, data) {
  const { rows } = await client.query(
    `INSERT INTO game_events(campaign_id,session_id,actor_character_id,event_type,aggregate_type,aggregate_id,payload,caused_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [data.campaignId, data.sessionId || null, data.actorId || null, data.type, data.aggregateType, data.aggregateId || null, data.payload || {}, data.causedBy || null]
  );
  return rows[0];
}

async function assertCharacter(client, characterId, campaignId, label = 'Персонаж') {
  if (!characterId) return null;
  const { rows } = await client.query('SELECT * FROM characters WHERE id=$1 AND campaign_id=$2', [characterId, campaignId]);
  if (!rows[0]) throw Object.assign(new Error(`${label} не найден в этой кампании`), { status: 404 });
  return rows[0];
}

export async function applyDamage({ campaignId, sessionId, actorId, targetId, amount, damageType = 'untyped' }) {
  return transaction(async (client) => {
    await assertCharacter(client, actorId, campaignId, 'Источник урона');
    const { rows } = await client.query('SELECT * FROM characters WHERE id=$1 AND campaign_id=$2 FOR UPDATE', [targetId, campaignId]);
    const target = rows[0];
    if (!target) throw Object.assign(new Error('Персонаж не найден в этой кампании'), { status: 404 });
    const incoming = Math.max(0, Number(amount));
    const absorbed = Math.min(Number(target.temp_hp), incoming);
    const hpDamage = incoming - absorbed;
    const hp = Math.max(0, Number(target.hp) - hpDamage);
    const tempHp = Number(target.temp_hp) - absorbed;
    await client.query('UPDATE characters SET hp=$1,temp_hp=$2,updated_at=now() WHERE id=$3', [hp, tempHp, targetId]);
    const root = await event(client, { campaignId, sessionId, actorId, type: 'DAMAGE_APPLIED', aggregateType: 'CHARACTER', aggregateId: targetId, payload: { amount: incoming, absorbed, hpDamage, damageType, hp, tempHp } });
    const concentration = await client.query('SELECT id FROM effects WHERE target_character_id=$1 AND concentration AND active', [targetId]);
    let concentrationCheck = null;
    if (concentration.rowCount && hpDamage > 0) {
      const rolled = rollDice('1d20');
      concentrationCheck = { ...rolled, dc: Math.max(10, Math.floor(hpDamage / 2)) };
      await event(client, { campaignId, sessionId, actorId: targetId, type: 'CONCENTRATION_CHECK_REQUIRED', aggregateType: 'CHARACTER', aggregateId: targetId, payload: concentrationCheck, causedBy: root.id });
    }
    return { event: root, character: { ...target, hp, temp_hp: tempHp }, concentrationCheck };
  });
}

export async function applyHealing({ campaignId, sessionId, actorId, targetId, amount, temporary = false }) {
  return transaction(async (client) => {
    await assertCharacter(client, actorId, campaignId, 'Источник лечения');
    const { rows } = await client.query('SELECT * FROM characters WHERE id=$1 AND campaign_id=$2 FOR UPDATE', [targetId, campaignId]);
    const target = rows[0];
    if (!target) throw Object.assign(new Error('Персонаж не найден в этой кампании'), { status: 404 });
    const value = Math.max(0, Number(amount));
    const hp = temporary ? Number(target.hp) : Math.min(Number(target.hp_max), Number(target.hp) + value);
    const tempHp = temporary ? Math.max(Number(target.temp_hp), value) : Number(target.temp_hp);
    await client.query('UPDATE characters SET hp=$1,temp_hp=$2,updated_at=now() WHERE id=$3', [hp, tempHp, targetId]);
    const resultEvent = await event(client, { campaignId, sessionId, actorId, type: temporary ? 'TEMP_HP_GRANTED' : 'HEALING_APPLIED', aggregateType: 'CHARACTER', aggregateId: targetId, payload: { amount: value, hp, tempHp } });
    return { event: resultEvent, character: { ...target, hp, temp_hp: tempHp } };
  });
}

export async function addEffect(input) {
  return transaction(async (client) => {
    await assertCharacter(client, input.sourceId, input.campaignId, 'Источник эффекта');
    await assertCharacter(client, input.targetId, input.campaignId, 'Цель эффекта');
    if (input.concentration && input.sourceId) {
      await client.query('UPDATE effects SET active=false WHERE source_character_id=$1 AND concentration AND active', [input.sourceId]);
    }
    const { rows } = await client.query(
      `INSERT INTO effects(campaign_id,target_character_id,source_character_id,name,category,description,value,duration_rounds,concentration,expires_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [input.campaignId,input.targetId,input.sourceId||null,input.name,input.category,input.description||'',input.value||{},input.durationRounds||null,!!input.concentration,input.expiresAt||null]
    );
    await event(client, { campaignId: input.campaignId, sessionId: input.sessionId, actorId: input.sourceId, type: 'EFFECT_ADDED', aggregateType: 'EFFECT', aggregateId: rows[0].id, payload: rows[0] });
    return rows[0];
  });
}

export async function acceptQuest({ campaignId, characterId, questId }) {
  return transaction(async (client) => {
    await assertCharacter(client, characterId, campaignId);
    const { rows } = await client.query("UPDATE quests SET status='ACTIVE',accepted_at=now() WHERE id=$1 AND campaign_id=$2 AND status='AVAILABLE' RETURNING *", [questId,campaignId]);
    if (!rows[0]) throw Object.assign(new Error('Задание недоступно'), { status: 409 });
    await event(client, { campaignId, actorId: characterId, type: 'QUEST_ACCEPTED', aggregateType: 'QUEST', aggregateId: questId, payload: { title: rows[0].title } });
    return rows[0];
  });
}

export async function identifyItem({ campaignId, characterId, entryId, method, propertyKey }) {
  return transaction(async (client) => {
    await assertCharacter(client, characterId, campaignId);
    const { rows } = await client.query(`SELECT ie.id,i.properties FROM inventory_entries ie JOIN items i ON i.id=ie.item_id JOIN characters c ON c.id=ie.character_id WHERE ie.id=$1 AND c.id=$2 AND c.campaign_id=$3`, [entryId,characterId,campaignId]);
    if (!rows[0]) throw Object.assign(new Error('Предмет не найден'), { status: 404 });
    const properties = Array.isArray(rows[0].properties) ? rows[0].properties : [];
    const property = properties.find((value) => value.key === propertyKey);
    if (!property) throw Object.assign(new Error('Свойство не найдено'), { status: 404 });
    await client.query('INSERT INTO item_discoveries(inventory_entry_id,property_key,method) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [entryId,propertyKey,method]);
    await event(client, { campaignId, actorId: characterId, type: 'ITEM_PROPERTY_DISCOVERED', aggregateType: 'INVENTORY_ENTRY', aggregateId: entryId, payload: { propertyKey, method } });
    return property;
  });
}

export async function recruit({ campaignId, actorId, characterId, type = 'INVITED', wageGp = 0 }) {
  return transaction(async (client) => {
    await assertCharacter(client, actorId, campaignId, 'Рекрутер');
    const found = await assertCharacter(client, characterId, campaignId, 'Кандидат');
    await client.query(`INSERT INTO party_members(campaign_id,character_id,recruitment_type,wage_gp) VALUES($1,$2,$3,$4)
      ON CONFLICT(campaign_id,character_id) DO UPDATE SET active=true,recruitment_type=EXCLUDED.recruitment_type,wage_gp=EXCLUDED.wage_gp`, [campaignId,characterId,type,wageGp]);
    await event(client, { campaignId, actorId, type: 'PARTY_MEMBER_RECRUITED', aggregateType: 'CHARACTER', aggregateId: characterId, payload: { type,wageGp } });
    return { id: found.id, name: found.name };
  });
}
