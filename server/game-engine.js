import { transaction } from './db.js';
import { rollDice } from './rules.js';

async function event(client, data) {
  const { rows } = await client.query(
    `INSERT INTO game_events(campaign_id,session_id,actor_character_id,event_type,aggregate_type,aggregate_id,payload,caused_by)
     VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,$6::uuid,$7,$8::uuid) RETURNING *`,
    [data.campaignId, data.sessionId || null, data.actorId || null, data.type, data.aggregateType, data.aggregateId || null, data.payload || {}, data.causedBy || null]
  );
  return rows[0];
}

async function journal(client, data) {
  if (!data.title || !data.body) return null;
  const { rows } = await client.query(
    `INSERT INTO journal_entries(campaign_id,session_id,author_character_id,entry_type,title,body,tags)
     VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7) RETURNING *`,
    [data.campaignId, data.sessionId || null, data.characterId || null, data.entryType || 'EVENT', data.title, data.body, data.tags || []]
  );
  return rows[0];
}

async function assertCharacter(client, characterId, campaignId, label = 'Персонаж') {
  if (!characterId) return null;
  const { rows } = await client.query(
    "SELECT * FROM characters WHERE id=$1::uuid AND campaign_id=$2::uuid",
    [characterId, campaignId]
  );
  if (!rows[0]) throw Object.assign(new Error(`${label} не найден в этой кампании`), { status: 404 });
  return rows[0];
}

async function assertItem(client, itemId, campaignId) {
  const { rows } = await client.query(
    'SELECT * FROM items WHERE id=$1::uuid AND (campaign_id=$2::uuid OR campaign_id IS NULL)',
    [itemId, campaignId]
  );
  if (!rows[0]) throw Object.assign(new Error('Предмет недоступен в этой кампании'), { status: 404 });
  return rows[0];
}

export async function applyDamage({ campaignId, sessionId, actorId, targetId, amount, damageType = 'untyped' }) {
  return transaction(async (client) => {
    await assertCharacter(client, actorId, campaignId, 'Источник урона');
    const target = await assertCharacter(client, targetId, campaignId, 'Цель урона');
    const locked = (await client.query('SELECT * FROM characters WHERE id=$1::uuid FOR UPDATE', [target.id])).rows[0];
    const incoming = Math.max(0, Number(amount));
    const absorbed = Math.min(Number(locked.temp_hp), incoming);
    const hpDamage = incoming - absorbed;
    const hp = Math.max(0, Number(locked.hp) - hpDamage);
    const tempHp = Number(locked.temp_hp) - absorbed;
    await client.query('UPDATE characters SET hp=$1,temp_hp=$2,updated_at=now() WHERE id=$3::uuid', [hp, tempHp, targetId]);
    const root = await event(client, { campaignId, sessionId, actorId, type: 'DAMAGE_TAKEN', aggregateType: 'CHARACTER', aggregateId: targetId, payload: { amount: incoming, absorbed, hpDamage, damageType, hp, tempHp } });
    await journal(client, { campaignId, sessionId, characterId: targetId, title: 'Получен урон', body: `${locked.name} получил(а) ${hpDamage} ед. урона. HP: ${hp}/${locked.hp_max}.`, tags: ['бой','урон'] });
    const concentration = await client.query('SELECT id FROM effects WHERE target_character_id=$1::uuid AND concentration AND active', [targetId]);
    let concentrationCheck = null;
    if (concentration.rowCount && hpDamage > 0) {
      const rolled = rollDice('1d20');
      concentrationCheck = { ...rolled, dc: Math.max(10, Math.floor(hpDamage / 2)) };
      await event(client, { campaignId, sessionId, actorId: targetId, type: 'CONCENTRATION_CHECK_REQUIRED', aggregateType: 'CHARACTER', aggregateId: targetId, payload: concentrationCheck, causedBy: root.id });
    }
    return { event: root, character: { ...locked, hp, temp_hp: tempHp }, concentrationCheck };
  });
}

export async function applyHealing({ campaignId, sessionId, actorId, targetId, amount, temporary = false }) {
  return transaction(async (client) => {
    await assertCharacter(client, actorId, campaignId, 'Источник лечения');
    const target = await assertCharacter(client, targetId, campaignId, 'Цель лечения');
    const locked = (await client.query('SELECT * FROM characters WHERE id=$1::uuid FOR UPDATE', [target.id])).rows[0];
    const value = Math.max(0, Number(amount));
    const hp = temporary ? Number(locked.hp) : Math.min(Number(locked.hp_max), Number(locked.hp) + value);
    const tempHp = temporary ? Math.max(Number(locked.temp_hp), value) : Number(locked.temp_hp);
    await client.query('UPDATE characters SET hp=$1,temp_hp=$2,updated_at=now() WHERE id=$3::uuid', [hp, tempHp, targetId]);
    const resultEvent = await event(client, { campaignId, sessionId, actorId, type: temporary ? 'TEMP_HP_GRANTED' : 'HEALING_RECEIVED', aggregateType: 'CHARACTER', aggregateId: targetId, payload: { amount: value, hp, tempHp } });
    await journal(client, { campaignId, sessionId, characterId: targetId, title: temporary ? 'Получены временные хиты' : 'Получено лечение', body: `${locked.name} ${temporary ? 'получил(а)' : 'восстановил(а)'} ${value} HP. HP: ${hp}/${locked.hp_max}${tempHp ? `, временные HP: ${tempHp}` : ''}.`, tags: ['состояние','лечение'] });
    return { event: resultEvent, character: { ...locked, hp, temp_hp: tempHp } };
  });
}

export async function receiveItem({ campaignId, sessionId, actorId, characterId, itemId, quantity = 1, reason = 'Получен предмет' }) {
  return transaction(async (client) => {
    await assertCharacter(client, actorId || characterId, campaignId, 'Источник получения предмета');
    const character = await assertCharacter(client, characterId, campaignId, 'Владелец предмета');
    const item = await assertItem(client, itemId, campaignId);
    const amount = Math.max(1, Math.floor(Number(quantity)));
    const { rows } = await client.query(`
      INSERT INTO inventory_entries(character_id,item_id,quantity)
      VALUES($1::uuid,$2::uuid,$3)
      ON CONFLICT(character_id,item_id)
      DO UPDATE SET quantity=inventory_entries.quantity+EXCLUDED.quantity
      RETURNING *`, [character.id,item.id,amount]);
    const resultEvent = await event(client, { campaignId, sessionId, actorId: actorId || characterId, type: 'ITEM_RECEIVED', aggregateType: 'INVENTORY_ENTRY', aggregateId: rows[0].id, payload: { itemId:item.id, itemName:item.name, quantity:amount, totalQuantity:rows[0].quantity, reason } });
    await journal(client, { campaignId, sessionId, characterId: character.id, title: 'Получен предмет', body: `${character.name} получил(а): ${item.name} ×${amount}.`, tags: ['инвентарь','получение'] });
    return { event: resultEvent, inventoryEntry: rows[0], item };
  });
}

export async function useItem({ campaignId, sessionId, actorId, entryId, targetId = null, context = '' }) {
  return transaction(async (client) => {
    const actor = await assertCharacter(client, actorId, campaignId, 'Использующий персонаж');
    const target = await assertCharacter(client, targetId || actorId, campaignId, 'Цель предмета');
    const { rows } = await client.query(`
      SELECT ie.*,i.name,i.item_type,i.consumable,i.properties,i.description
      FROM inventory_entries ie
      JOIN items i ON i.id=ie.item_id
      JOIN characters c ON c.id=ie.character_id
      WHERE ie.id=$1::uuid AND ie.character_id=$2::uuid AND c.campaign_id=$3::uuid
      FOR UPDATE`, [entryId,actor.id,campaignId]);
    const entry = rows[0];
    if (!entry) throw Object.assign(new Error('Предмет не найден в инвентаре персонажа'), { status: 404 });
    if (Number(entry.quantity) < 1) throw Object.assign(new Error('Предмет закончился'), { status: 409 });

    const properties = Array.isArray(entry.properties) ? entry.properties : [];
    const healProperty = properties.find((property) => property?.key === 'heal' && property?.formula);
    let healing = null;
    if (healProperty) {
      const roll = rollDice(healProperty.formula);
      healing = await applyHealingInsideTransaction(client, { campaignId, sessionId, actorId: actor.id, targetId: target.id, amount: roll.total, source: entry.name, roll });
    }

    let remaining = Number(entry.quantity);
    if (entry.consumable) {
      remaining -= 1;
      if (remaining === 0) {
        await client.query('DELETE FROM inventory_entries WHERE id=$1::uuid', [entry.id]);
      } else {
        await client.query('UPDATE inventory_entries SET quantity=$1 WHERE id=$2::uuid', [remaining,entry.id]);
      }
    }

    const resultEvent = await event(client, { campaignId, sessionId, actorId: actor.id, type: 'ITEM_USED', aggregateType: 'INVENTORY_ENTRY', aggregateId: entry.id, payload: { itemId:entry.item_id, itemName:entry.name, consumable:entry.consumable, remainingQuantity:entry.consumable ? remaining : Number(entry.quantity), targetId:target.id, context, healing: healing?.roll || null } });
    await journal(client, { campaignId, sessionId, characterId: actor.id, title: 'Использован предмет', body: `${actor.name} использовал(а) ${entry.name}${context ? ` (${context})` : ''}.${healing ? ` Восстановлено ${healing.roll.total} HP.` : ''}`, tags: ['инвентарь','использование'] });
    return { event: resultEvent, consumed: !!entry.consumable, remainingQuantity: entry.consumable ? remaining : Number(entry.quantity), item: { id:entry.item_id, name:entry.name }, healing };
  });
}

async function applyHealingInsideTransaction(client, { campaignId, sessionId, actorId, targetId, amount, source, roll }) {
  const target = (await client.query('SELECT * FROM characters WHERE id=$1::uuid AND campaign_id=$2::uuid FOR UPDATE', [targetId,campaignId])).rows[0];
  if (!target) throw Object.assign(new Error('Цель лечения не найдена'), { status:404 });
  const hp = Math.min(Number(target.hp_max), Number(target.hp) + Math.max(0,Number(amount)));
  await client.query('UPDATE characters SET hp=$1,updated_at=now() WHERE id=$2::uuid', [hp,targetId]);
  const resultEvent = await event(client, { campaignId,sessionId,actorId,type:'HEALING_RECEIVED',aggregateType:'CHARACTER',aggregateId:targetId,payload:{amount:Number(amount),hp,hpMax:target.hp_max,source,roll} });
  return { event:resultEvent,roll,character:{...target,hp} };
}

export async function discoverLocation({ campaignId, sessionId, characterId, locationId, level = 'SEEN', facts = [] }) {
  return transaction(async (client) => {
    const character = await assertCharacter(client, characterId, campaignId);
    const { rows } = await client.query('SELECT * FROM locations WHERE id=$1::uuid AND campaign_id=$2::uuid', [locationId,campaignId]);
    if (!rows[0]) throw Object.assign(new Error('Локация не найдена в этой кампании'), { status:404 });
    const knowledgeLevel = ['SEEN','STUDIED','COMPLETE'].includes(level) ? level : 'SEEN';
    const knowledge = (await client.query(`
      INSERT INTO knowledge_entries(campaign_id,character_id,subject_type,subject_id,level,facts)
      VALUES($1::uuid,$2::uuid,'LOCATION',$3::uuid,$4,$5::jsonb)
      ON CONFLICT(character_id,subject_type,subject_id)
      DO UPDATE SET level=EXCLUDED.level,facts=EXCLUDED.facts,updated_at=now()
      RETURNING *`, [campaignId,character.id,locationId,knowledgeLevel,JSON.stringify(facts)])).rows[0];
    const resultEvent = await event(client, { campaignId,sessionId,actorId:character.id,type:knowledgeLevel==='SEEN'?'LOCATION_DISCOVERED':'LOCATION_VISITED',aggregateType:'LOCATION',aggregateId:locationId,payload:{locationId,name:rows[0].name,level:knowledgeLevel} });
    await journal(client, { campaignId,sessionId,characterId:character.id,title:'Открыта новая локация',body:`${character.name} обнаружил(а) локацию «${rows[0].name}».`,tags:['карта','исследование'] });
    return { event:resultEvent,knowledge,location:rows[0] };
  });
}

export async function discoverCreature({ campaignId, sessionId, characterId, creatureId, level = 'SEEN', facts = [] }) {
  return transaction(async (client) => {
    const character = await assertCharacter(client, characterId, campaignId);
    const creature = (await client.query('SELECT * FROM creatures WHERE id=$1::uuid AND campaign_id=$2::uuid', [creatureId,campaignId])).rows[0];
    if (!creature) throw Object.assign(new Error('Существо не найдено в этой кампании'), { status:404 });
    const knowledgeLevel = ['SEEN','STUDIED','COMPLETE'].includes(level) ? level : 'SEEN';
    const knowledge = (await client.query(`
      INSERT INTO knowledge_entries(campaign_id,character_id,subject_type,subject_id,level,facts)
      VALUES($1::uuid,$2::uuid,'CREATURE',$3::uuid,$4,$5::jsonb)
      ON CONFLICT(character_id,subject_type,subject_id)
      DO UPDATE SET level=EXCLUDED.level,facts=EXCLUDED.facts,updated_at=now()
      RETURNING *`, [campaignId,character.id,creatureId,knowledgeLevel,JSON.stringify(facts)])).rows[0];
    const resultEvent = await event(client, { campaignId,sessionId,actorId:character.id,type:knowledgeLevel==='SEEN'?'CREATURE_ENCOUNTERED':knowledgeLevel==='STUDIED'?'CREATURE_STUDIED':'CREATURE_DEFEATED',aggregateType:'CREATURE',aggregateId:creatureId,payload:{creatureId,name:creature.name,level:knowledgeLevel} });
    await journal(client, { campaignId,sessionId,characterId:character.id,title:'Новое существо',body:`${character.name} встретил(а) существо «${creature.name}».`,tags:['бестиарий','встреча'] });
    return { event:resultEvent,knowledge,creature };
  });
}

export async function addEffect(input) {
  return transaction(async (client) => {
    await assertCharacter(client, input.sourceId, input.campaignId, 'Источник эффекта');
    await assertCharacter(client, input.targetId, input.campaignId, 'Цель эффекта');
    if (input.concentration && input.sourceId) {
      await client.query('UPDATE effects SET active=false WHERE source_character_id=$1::uuid AND concentration AND active', [input.sourceId]);
    }
    const { rows } = await client.query(
      `INSERT INTO effects(campaign_id,target_character_id,source_character_id,name,category,description,value,duration_rounds,concentration,expires_at)
       VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7::jsonb,$8,$9,$10) RETURNING *`,
      [input.campaignId,input.targetId,input.sourceId||null,input.name,input.category,input.description||'',input.value||{},input.durationRounds||null,!!input.concentration,input.expiresAt||null]
    );
    await event(client, { campaignId: input.campaignId, sessionId: input.sessionId, actorId: input.sourceId, type: 'EFFECT_APPLIED', aggregateType: 'EFFECT', aggregateId: rows[0].id, payload: rows[0] });
    return rows[0];
  });
}

export async function acceptQuest({ campaignId, characterId, questId }) {
  return transaction(async (client) => {
    await assertCharacter(client, characterId, campaignId);
    const { rows } = await client.query("UPDATE quests SET status='ACTIVE',accepted_at=now() WHERE id=$1::uuid AND campaign_id=$2::uuid AND status='AVAILABLE' RETURNING *", [questId,campaignId]);
    if (!rows[0]) throw Object.assign(new Error('Задание недоступно'), { status: 409 });
    await event(client, { campaignId, actorId: characterId, type: 'QUEST_ACCEPTED', aggregateType: 'QUEST', aggregateId: questId, payload: { title: rows[0].title } });
    await journal(client, { campaignId, characterId, title:'Принято задание', body:`${rows[0].title}.`, tags:['квест'] });
    return rows[0];
  });
}

export async function identifyItem({ campaignId, characterId, entryId, method, propertyKey }) {
  return transaction(async (client) => {
    await assertCharacter(client, characterId, campaignId);
    const { rows } = await client.query(`SELECT ie.id,i.properties FROM inventory_entries ie JOIN items i ON i.id=ie.item_id JOIN characters c ON c.id=ie.character_id WHERE ie.id=$1::uuid AND c.id=$2::uuid AND c.campaign_id=$3::uuid`, [entryId,characterId,campaignId]);
    if (!rows[0]) throw Object.assign(new Error('Предмет не найден'), { status: 404 });
    const properties = Array.isArray(rows[0].properties) ? rows[0].properties : [];
    const property = properties.find((value) => value.key === propertyKey);
    if (!property) throw Object.assign(new Error('Свойство не найдено'), { status: 404 });
    await client.query('INSERT INTO item_discoveries(inventory_entry_id,property_key,method) VALUES($1::uuid,$2,$3) ON CONFLICT DO NOTHING', [entryId,propertyKey,method]);
    await event(client, { campaignId, actorId: characterId, type: 'ITEM_IDENTIFIED', aggregateType: 'INVENTORY_ENTRY', aggregateId: entryId, payload: { propertyKey, method } });
    return property;
  });
}

export async function recruit({ campaignId, actorId, characterId, type = 'INVITED', wageGp = 0 }) {
  return transaction(async (client) => {
    await assertCharacter(client, actorId, campaignId, 'Рекрутер');
    const found = await assertCharacter(client, characterId, campaignId, 'Кандидат');
    await client.query(`INSERT INTO party_members(campaign_id,character_id,recruitment_type,wage_gp) VALUES($1::uuid,$2::uuid,$3,$4)
      ON CONFLICT(campaign_id,character_id) DO UPDATE SET active=true,recruitment_type=EXCLUDED.recruitment_type,wage_gp=EXCLUDED.wage_gp`, [campaignId,characterId,type,wageGp]);
    await event(client, { campaignId, actorId, type: 'PARTY_MEMBER_RECRUITED', aggregateType: 'CHARACTER', aggregateId: characterId, payload: { type,wageGp } });
    return { id: found.id, name: found.name };
  });
}
