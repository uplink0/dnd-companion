import { Router } from 'express';
import { z } from 'zod';
import { pool, transaction } from './db.js';
import { config } from './config.js';
import { derivedCharacter, rollDice } from './rules.js';
import { acceptQuest, addEffect, applyDamage, applyHealing, identifyItem, recruit } from './game-engine.js';

export const api = Router();
const asyncRoute = (handler) => (req,res,next) => Promise.resolve(handler(req,res)).catch(next);

const RACE_BONUSES = {
  'Человек': {str:1,dex:1,con:1,int:1,wis:1,cha:1},
  'Высший эльф': {dex:2,int:1},
  'Дварф': {con:2,wis:1},
  'Дроу': {dex:2,cha:1},
  'Полуорк': {str:2,con:1},
  'Полурослик': {dex:2,cha:1}
};
const CLASS_BONUSES = {
  'Воин': {str:2,con:1}, 'Следопыт': {dex:2,wis:1}, 'Вор': {dex:2,cha:1},
  'Чародей': {cha:2,con:1}, 'Волшебник': {int:2,wis:1}, 'Жрец': {wis:2,con:1},
  'Паладин': {str:2,cha:1}, 'Варвар': {str:2,con:1}
};
const CLASS_DATA = {
  'Воин': {die:10,hp:10,spell:false}, 'Следопыт': {die:10,hp:10,spell:false}, 'Вор': {die:8,hp:8,spell:false},
  'Чародей': {die:6,hp:6,spell:true}, 'Волшебник': {die:6,hp:6,spell:true}, 'Жрец': {die:8,hp:8,spell:true},
  'Паладин': {die:10,hp:10,spell:true}, 'Варвар': {die:12,hp:12,spell:false}
};
const STAT_KEYS = ['str','dex','con','int','wis','cha'];
function statBonuses(race,className){return STAT_KEYS.reduce((out,key)=>{out[key]=(RACE_BONUSES[race]?.[key]||0)+(CLASS_BONUSES[className]?.[key]||0);return out;},{});}
function validateBaseAbilities(abilities){
  const values=Object.fromEntries(STAT_KEYS.map(k=>[k,Number(abilities?.[k])||0]));
  const total=STAT_KEYS.reduce((sum,k)=>sum+values[k],0);
  if(total!==72) throw Object.assign(new Error(`Нужно ровно 72 базовых очка. Сейчас: ${total}`),{status:400});
  for(const key of STAT_KEYS) if(values[key]<1||values[key]>18) throw Object.assign(new Error(`Базовая ${key.toUpperCase()} должна быть от 1 до 18`),{status:400});
  return values;
}
function generateBaseAbilities(){
  const values=Object.fromEntries(STAT_KEYS.map(k=>[k,12]));
  let remaining=72-72;
  while(remaining<0) remaining=0;
  if(remaining===0) return values;
  return values;
}

async function characterSummary(id) {
  const { rows } = await pool.query('SELECT * FROM characters WHERE id=$1', [id]);
  if (!rows[0]) throw Object.assign(new Error('Персонаж не найден'), { status: 404 });
  const [effects, inventory] = await Promise.all([
    pool.query('SELECT * FROM effects WHERE target_character_id=$1 AND active ORDER BY started_at DESC', [id]),
    pool.query(`SELECT ie.id,ie.quantity,ie.equipped,ie.attuned,ie.charges,COALESCE(ie.custom_name,i.name) name,i.item_type,i.rarity,i.description,i.properties,
      COALESCE(json_agg(d.property_key) FILTER (WHERE d.property_key IS NOT NULL),'[]') discovered_properties
      FROM inventory_entries ie JOIN items i ON i.id=ie.item_id LEFT JOIN item_discoveries d ON d.inventory_entry_id=ie.id
      WHERE ie.character_id=$1 GROUP BY ie.id,i.id ORDER BY i.name`, [id])
  ]);
  return { ...derivedCharacter(rows[0]), effects: effects.rows, inventory: inventory.rows };
}

api.get('/health', asyncRoute(async (req,res) => {
  const started=Date.now();
  try { await pool.query('SELECT 1'); res.json({ok:true,service:'dnd-realm',database:'ready',responseMs:Date.now()-started}); }
  catch(error){res.status(503).json({ok:false,service:'dnd-realm',database:'unavailable',error:error.message});}
}));

api.get('/campaigns/:id/characters', asyncRoute(async (req,res) => {
  const { rows } = await pool.query(`SELECT id,campaign_id,kind,name,race,class_name,subclass,background,rank,level,xp,xp_next,hp,hp_max,temp_hp,armor_class,speed,initiative,proficiency_bonus,spell_save_dc,spell_attack_bonus,hit_dice,abilities,inspiration,currency,biography,portrait_url,updated_at FROM characters WHERE campaign_id=$1 ORDER BY kind='PLAYER' DESC,name`,[req.params.id]);
  res.json(rows.map(derivedCharacter));
}));

api.post('/characters/generate', asyncRoute(async (req,res) => {
  const races=Object.keys(RACE_BONUSES), classes=Object.keys(CLASS_BONUSES);
  const race=races[Math.floor(Math.random()*races.length)], className=classes[Math.floor(Math.random()*classes.length)];
  const names=['Аэлин','Бранд','Кайра','Торвальд','Лиора','Маркел','Сайра','Эдрен'];
  const name=names[Math.floor(Math.random()*names.length)];
  const base={str:12,dex:12,con:12,int:12,wis:12,cha:12};
  const options=[];
  while(options.length<6){const k=STAT_KEYS[Math.floor(Math.random()*STAT_KEYS.length)];if(base[k]<14){base[k]+=1;options.push(k);}}
  return res.json({name,race,className,background:'Странник и искатель приключений',abilities:base,raceBonuses:RACE_BONUSES[race],classBonuses:CLASS_BONUSES[className],total:72});
}));

api.post('/characters', asyncRoute(async (req,res) => {
  const input=z.object({campaignId:z.string().uuid(),name:z.string().trim().min(1).max(80),race:z.string().min(1),className:z.string().min(1),background:z.string().max(120).optional(),abilities:z.record(z.number())}).parse(req.body);
  if(!RACE_BONUSES[input.race]||!CLASS_BONUSES[input.className]) throw Object.assign(new Error('Неизвестная раса или класс'),{status:400});
  const base=validateBaseAbilities(input.abilities), bonus=statBonuses(input.race,input.className);
  const abilities=Object.fromEntries(STAT_KEYS.map(k=>[k,base[k]+bonus[k]]));
  const cls=CLASS_DATA[input.className];
  const conMod=Math.floor((abilities.con-10)/2), dexMod=Math.floor((abilities.dex-10)/2), wisMod=Math.floor((abilities.wis-10)/2), intMod=Math.floor((abilities.int-10)/2), chaMod=Math.floor((abilities.cha-10)/2);
  const hp=Math.max(1,cls.hp+conMod), ac=10+dexMod;
  const spell=cls.spell ? {spellSave:8+2+wisMod,spellAttack:2+chaMod}: {spellSave:null,spellAttack:null};
  const id=await transaction(async(client)=>{
    const character=(await client.query(`INSERT INTO characters(campaign_id,kind,name,race,class_name,background,rank,level,xp,xp_next,hp,hp_max,armor_class,speed,initiative,proficiency_bonus,spell_save_dc,spell_attack_bonus,hit_dice,abilities,biography) VALUES($1,'PLAYER',$2,$3,$4,$5,'Новичок',1,0,300,$6,$6,$7,30,$8,2,$9,$10,$11,$12,$13) RETURNING *`,[input.campaignId,input.name,input.race,input.className,input.background||'',hp,ac,dexMod,spell.spellSave,spell.spellAttack,`1d${cls.die}`,JSON.stringify(abilities),`${input.name} — ${input.race}, ${input.className}. История героя начинается с момента создания.`])).rows[0];
    await client.query(`INSERT INTO party_members(campaign_id,character_id,recruitment_type) VALUES($1,$2,'START') ON CONFLICT DO NOTHING`,[input.campaignId,character.id]);
    return character.id;
  });
  res.status(201).json(await characterSummary(id));
}));

api.get('/bootstrap', asyncRoute(async (req,res) => {
  const campaignId=String(req.query.campaignId||config.defaultCampaignId), characterId=String(req.query.characterId||'');
  const [campaign,character,party,quests,locations,messages,journal,events,bestiary]=await Promise.all([
    pool.query('SELECT * FROM campaigns WHERE id=$1',[campaignId]), characterId?characterSummary(characterId):Promise.resolve(null),
    pool.query(`SELECT c.*,COALESCE(json_agg(e.*) FILTER(WHERE e.id IS NOT NULL),'[]') effects FROM party_members p JOIN characters c ON c.id=p.character_id LEFT JOIN effects e ON e.target_character_id=c.id AND e.active WHERE p.campaign_id=$1 AND p.active GROUP BY c.id ORDER BY p.joined_at`,[campaignId]),
    pool.query(`SELECT q.*,COALESCE(json_agg(o.* ORDER BY o.sort_order) FILTER(WHERE o.id IS NOT NULL),'[]') objectives FROM quests q LEFT JOIN quest_objectives o ON o.quest_id=q.id WHERE q.campaign_id=$1 GROUP BY q.id ORDER BY q.status,q.title`,[campaignId]),
    pool.query('SELECT * FROM locations WHERE campaign_id=$1 AND discovered ORDER BY name',[campaignId]),
    pool.query(`SELECT * FROM messages WHERE campaign_id=$1 AND ($2='' OR character_id=$2 OR (role='SYSTEM' AND character_id IS NULL)) ORDER BY created_at DESC LIMIT 60`,[campaignId,characterId]),
    pool.query(`SELECT * FROM journal_entries WHERE campaign_id=$1 AND ($2='' OR author_character_id=$2 OR author_character_id IS NULL) ORDER BY created_at DESC LIMIT 40`,[campaignId,characterId]),
    pool.query(`SELECT * FROM game_events WHERE campaign_id=$1 AND ($2='' OR actor_character_id=$2 OR (aggregate_type='CHARACTER' AND aggregate_id=$2)) ORDER BY sequence DESC LIMIT 100`,[campaignId,characterId]),
    characterId?pool.query(`SELECT cr.id,cr.name,cr.creature_type,cr.challenge_rating,k.level,k.facts,CASE WHEN k.level IN ('STUDIED','COMPLETE') THEN cr.public_data ELSE '{}'::jsonb END details FROM knowledge_entries k JOIN creatures cr ON cr.id=k.subject_id WHERE k.campaign_id=$1 AND k.subject_type='CREATURE' AND k.level<>'UNKNOWN' AND k.character_id=$2`,[campaignId,characterId]):Promise.resolve({rows:[]})
  ]);
  if(!campaign.rows[0]) throw Object.assign(new Error('Кампания не найдена'),{status:404});
  res.json({campaign:campaign.rows[0],character,party:party.rows,quests:quests.rows,locations:locations.rows,messages:messages.rows.reverse(),journal:journal.rows,events:events.rows.reverse(),bestiary:bestiary.rows});
}));
api.get('/characters/:id/summary', asyncRoute(async(req,res)=>res.json(await characterSummary(req.params.id))));
api.get('/campaigns/:id/quests', asyncRoute(async(req,res)=>res.json((await pool.query('SELECT * FROM quests WHERE campaign_id=$1 ORDER BY status,title',[req.params.id])).rows)));
api.get('/campaigns/:id/events', asyncRoute(async(req,res)=>{const characterId=String(req.query.characterId||'');const q=characterId?`SELECT * FROM game_events WHERE campaign_id=$1 AND (actor_character_id=$2 OR (aggregate_type='CHARACTER' AND aggregate_id=$2)) ORDER BY sequence DESC LIMIT 100`:`SELECT * FROM game_events WHERE campaign_id=$1 ORDER BY sequence DESC LIMIT 100`;res.json((await pool.query(q,characterId?[req.params.id,characterId]:[req.params.id])).rows.reverse());}));
api.get('/campaigns/:id/messages', asyncRoute(async(req,res)=>{const characterId=String(req.query.characterId||'');const q=characterId?`SELECT * FROM messages WHERE campaign_id=$1 AND (character_id=$2 OR (role='SYSTEM' AND character_id IS NULL)) ORDER BY created_at ASC`:`SELECT * FROM messages WHERE campaign_id=$1 ORDER BY created_at ASC`;res.json((await pool.query(q,characterId?[req.params.id,characterId]:[req.params.id])).rows);}));
api.get('/campaigns/:id/journal', asyncRoute(async(req,res)=>{const characterId=String(req.query.characterId||'');const q=characterId?`SELECT * FROM journal_entries WHERE campaign_id=$1 AND (author_character_id=$2 OR author_character_id IS NULL) ORDER BY created_at DESC LIMIT 100`:`SELECT * FROM journal_entries WHERE campaign_id=$1 ORDER BY created_at DESC LIMIT 100`;res.json((await pool.query(q,characterId?[req.params.id,characterId]:[req.params.id])).rows);}));
api.post('/campaigns/:id/rolls', asyncRoute(async(req,res)=>{const input=z.object({characterId:z.string().uuid(),notation:z.string(),reason:z.string().max(200).optional()}).parse(req.body);const roll=rollDice(input.notation);const {rows}=await pool.query(`INSERT INTO dice_rolls(campaign_id,character_id,notation,dice_total,modifier,total,reason) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[req.params.id,input.characterId,roll.notation,roll.diceTotal,roll.modifier,roll.total,input.reason||'']);res.status(201).json({...rows[0],dice:roll.dice});}));
api.post('/campaigns/:id/messages', asyncRoute(async(req,res)=>{const input=z.object({characterId:z.string().uuid(),body:z.string().min(1).max(4000)}).parse(req.body);const result=await transaction(async(client)=>{const character=(await client.query('SELECT name,hp,hp_max,armor_class,level FROM characters WHERE id=$1 AND campaign_id=$2',[input.characterId,req.params.id])).rows[0];if(!character)throw Object.assign(new Error('Персонаж не найден в этой кампании'),{status:404});const player=(await client.query(`INSERT INTO messages(campaign_id,character_id,role,body) VALUES($1,$2,'PLAYER',$3) RETURNING *`,[req.params.id,input.characterId,input.body])).rows[0];const recent=(await client.query(`SELECT body,role FROM messages WHERE campaign_id=$1 AND character_id=$2 ORDER BY created_at DESC LIMIT 6`,[req.params.id,input.characterId])).rows.reverse();const answer=`${character.name} делает шаг вперёд. Мастер учитывает ${character.hp}/${character.hp_max} HP, КД ${character.armor_class}, уровень ${character.level}, активные эффекты и предыдущие действия героя. Ваше намерение: «${input.body}». Мир реагирует на него, а результат будет связан с выбранным персонажем и его историей.`;const master=(await client.query(`INSERT INTO messages(campaign_id,character_id,role,body,metadata) VALUES($1,$2,'MASTER',$3,$4) RETURNING *`,[req.params.id,input.characterId,answer,{engine:'local-rules',recentTurns:recent.length}])).rows[0];await client.query(`INSERT INTO game_events(campaign_id,actor_character_id,event_type,aggregate_type,aggregate_id,payload) VALUES($1,$2,'PLAYER_ACTION','MESSAGE',$3,$4)`,[req.params.id,input.characterId,player.id,{text:input.body,responseId:master.id}]);return{player,master};});res.status(201).json(result);}));
api.post('/campaigns/:id/damage', asyncRoute(async(req,res)=>res.json(await applyDamage({campaignId:req.params.id,...z.object({targetId:z.string().uuid(),actorId:z.string().uuid().optional(),amount:z.number().nonnegative(),damageType:z.string().optional()}).parse(req.body)}))));
api.post('/campaigns/:id/healing', asyncRoute(async(req,res)=>res.json(await applyHealing({campaignId:req.params.id,...z.object({targetId:z.string().uuid(),actorId:z.string().uuid().optional(),amount:z.number().nonnegative(),temporary:z.boolean().optional()}).parse(req.body)}))));
api.post('/campaigns/:id/effects', asyncRoute(async(req,res)=>res.status(201).json(await addEffect({campaignId:req.params.id,...z.object({targetId:z.string().uuid(),sourceId:z.string().uuid().optional(),name:z.string().min(1),category:z.enum(['BUFF','DEBUFF','CONDITION']),description:z.string().optional(),value:z.record(z.any()).optional(),durationRounds:z.number().int().positive().optional(),concentration:z.boolean().optional()}).parse(req.body)}))));
api.post('/campaigns/:id/quests/:questId/accept', asyncRoute(async(req,res)=>res.json(await acceptQuest({campaignId:req.params.id,questId:req.params.questId,characterId:z.string().uuid().parse(req.body.characterId)}))));
api.post('/campaigns/:id/items/:entryId/identify', asyncRoute(async(req,res)=>res.json(await identifyItem({campaignId:req.params.id,entryId:req.params.entryId,...z.object({characterId:z.string().uuid(),method:z.enum(['MAGIC','APPRAISER','ARCANA','INVESTIGATION','USE','ACCIDENT']),propertyKey:z.string()}).parse(req.body)}))));
api.post('/campaigns/:id/party/recruit', asyncRoute(async(req,res)=>res.status(201).json(await recruit({campaignId:req.params.id,...z.object({actorId:z.string().uuid(),characterId:z.string().uuid(),type:z.enum(['INVITED','ACCEPTED','HIRED']).optional(),wageGp:z.number().int().nonnegative().optional()}).parse(req.body)}))));