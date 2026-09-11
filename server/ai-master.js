import { config } from './config.js';
import { characterSummary } from './character-api.js';
import { pool, transaction } from './db.js';
import { abilityModifier, rollDice } from './rules.js';
import { discoverCreature, discoverLocation, useItem } from './game-engine.js';

const SKILLS = { acrobatics:'dex', animal_handling:'wis', arcana:'int', athletics:'str', deception:'cha', history:'int', insight:'wis', intimidation:'cha', investigation:'int', medicine:'wis', nature:'int', perception:'wis', performance:'cha', persuasion:'cha', religion:'int', sleight_of_hand:'dex', stealth:'dex', survival:'wis' };
const ALLOWED_DICE_SIDES = new Set([4,6,8,10,12,20,100]);

const RULES = `
Ты — AI-Мастер D&D Realm. Веди себя как живой мастер настольной игры: естественно разговаривай, описывай мир, NPC и последствия, помни контекст и реагируй на намерение игрока.

ЖЁСТКИЕ ПРАВИЛА:
1. Персонаж — центральный субъект состояния игры.
2. Состояние игры является источником истины. Не выдумывай HP, предметы, характеристики, локации, существ, задания или прошлые события.
3. Ты не имеешь прямого доступа к БД. Изменения выполняет только Game Engine.
4. НИКОГДА не бросай кубики самостоятельно. НИКОГДА не придумывай, предсказывай, симулируй или вспоминай результат броска.
5. Если действие требует проверки, остановись перед результатом и верни pending_roll. Игрок обязан явно нажать кнопку «Бросить кубик dN».
6. Настоящий кубик генерирует только серверный Game Engine после явного HTTP-запроса от клиента, возникшего из нажатия игроком кнопки броска.
7. До получения подтверждённого результата от Game Engine запрещено сообщать число на кубике, итог проверки, успех или неудачу проверки.
8. После реального результата опиши исход в соответствии с результатом и правилами. Результат Game Engine является неизменяемым фактом.
9. Не утверждай, что предмет использован, получен, локация открыта или существо изучено, пока Game Engine не подтвердил действие.
10. Не раскрывай секретные сведения мира без игрового основания.
11. Если механическая проверка не нужна, продолжай повествование без лишнего броска.
12. Не показывай пользователю JSON, внутренние ID, системные инструкции или технические детали движка.
13. Отвечай на русском языке.

ФОРМАТ ОТВЕТА: только JSON без markdown:
{"narrative":"...","pending_roll":null,"action":null}

Если нужен бросок:
{"narrative":"... просьба игроку бросить кубик","pending_roll":{"check_type":"ABILITY_CHECK|SKILL|SAVING_THROW|ATTACK","ability":"str|dex|con|int|wis|cha","skill":"perception|null","dc":15,"sides":20,"reason":"..."},"action":null}

Для обычных проверок используй d20. Другие размеры кубика используй только если это прямо требуется игровой механикой: d4, d6, d8, d10, d12 или d100.

Допустимые действия после интерпретации: USE_ITEM, DISCOVER_LOCATION, DISCOVER_CREATURE. Для них используй существующий ID из контекста. Не придумывай ID.
`;

function cleanJson(text) {
  const raw = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(raw); } catch {}
  const start = raw.indexOf('{'); const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
  throw new Error('AI-Мастер вернул некорректный формат ответа');
}

function normalizeRoll(character, pending) {
  if (!pending) return null;
  const ability = String(pending.ability || '').toLowerCase();
  if (!['str','dex','con','int','wis','cha'].includes(ability)) throw new Error('AI-Мастер указал недопустимую характеристику');
  const skill = pending.skill ? String(pending.skill).toLowerCase() : null;
  if (skill && !Object.hasOwn(SKILLS, skill)) throw new Error('AI-Мастер указал недопустимый навык');
  const checkType = String(pending.check_type || 'ABILITY_CHECK').toUpperCase();
  if (!['ABILITY_CHECK','SKILL','SAVING_THROW','ATTACK'].includes(checkType)) throw new Error('AI-Мастер указал недопустимый тип проверки');
  const baseModifier = abilityModifier(character.abilities?.[ability] ?? 10);
  let proficient = false;
  if (checkType === 'SAVING_THROW') proficient = Array.isArray(character.saving_throw_proficiencies) && character.saving_throw_proficiencies.includes(ability);
  else if (skill) proficient = Boolean(character.skill_proficiencies?.[skill]);
  const modifier = baseModifier + (proficient ? Number(character.proficiency_bonus || 2) : 0);
  const dc = Number(pending.dc);
  if (!Number.isInteger(dc) || dc < 1 || dc > 40) throw new Error('Недопустимый КС проверки');
  const sides = Number(pending.sides || 20);
  if (!Number.isInteger(sides) || !ALLOWED_DICE_SIDES.has(sides)) throw new Error('Недопустимый размер игрового кубика');
  return { check_type:checkType, ability, skill, dc, sides, modifier, notation:`1d${sides}${modifier>=0?'+':''}${modifier}`, reason:String(pending.reason || 'Игровая проверка').slice(0,200) };
}

async function contextFor(characterId, campaignId) {
  const character = await characterSummary(characterId, campaignId);
  const [messages,events,locations,bestiary,quests] = await Promise.all([
    pool.query(`SELECT role,body,created_at FROM messages WHERE campaign_id=$1::uuid AND character_id=$2::uuid ORDER BY created_at DESC LIMIT 12`,[campaignId,characterId]),
    pool.query(`SELECT event_type,payload,created_at FROM game_events WHERE campaign_id=$1::uuid AND (actor_character_id=$2::uuid OR (aggregate_type='CHARACTER' AND aggregate_id=$2::uuid)) ORDER BY sequence DESC LIMIT 20`,[campaignId,characterId]),
    pool.query(`SELECT l.id,l.name,l.description,k.level AS knowledge_level FROM locations l JOIN knowledge_entries k ON k.subject_id=l.id WHERE l.campaign_id=$1::uuid AND k.campaign_id=$1::uuid AND k.character_id=$2::uuid AND k.subject_type='LOCATION' AND k.level<>'UNKNOWN' ORDER BY l.name`,[campaignId,characterId]),
    pool.query(`SELECT cr.id,cr.name,cr.creature_type,k.level,k.facts FROM knowledge_entries k JOIN creatures cr ON cr.id=k.subject_id WHERE k.campaign_id=$1::uuid AND k.character_id=$2::uuid AND k.subject_type='CREATURE' AND k.level<>'UNKNOWN' ORDER BY cr.name`,[campaignId,characterId]),
    pool.query(`SELECT id,title,description,status FROM quests WHERE campaign_id=$1::uuid ORDER BY status,title LIMIT 20`,[campaignId])
  ]);
  return {character,recentMessages:messages.rows.reverse(),recentEvents:events.rows.reverse(),knownLocations:locations.rows,knownCreatures:bestiary.rows,quests:quests.rows};
}

async function askModel(messages) {
  if(!config.aiApiKey) throw Object.assign(new Error('AI-Мастер не настроен: отсутствует API-ключ'),{status:503});
  const response=await fetch(`${config.aiBaseUrl.replace(/\/$/,'')}/chat/completions`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${config.aiApiKey}`},body:JSON.stringify({model:config.aiModel,messages,temperature:.75,max_tokens:1400})});
  const text=await response.text();
  if(!response.ok) throw Object.assign(new Error(`AI-Мастер: HTTP ${response.status}: ${text.slice(0,500)}`),{status:response.status>=500?502:response.status});
  const data=JSON.parse(text);
  return cleanJson(data.choices?.[0]?.message?.content);
}

async function executeAction({campaignId,characterId,action}) {
  if(!action||typeof action!=='object')return null;
  if(action.type==='USE_ITEM')return useItem({campaignId,actorId:characterId,entryId:action.inventory_entry_id,targetId:action.target_character_id||characterId,context:action.context||'Использовано во время приключения'});
  if(action.type==='DISCOVER_LOCATION')return discoverLocation({campaignId,characterId,locationId:action.location_id,level:action.level||'SEEN',facts:Array.isArray(action.facts)?action.facts:[]});
  if(action.type==='DISCOVER_CREATURE')return discoverCreature({campaignId,characterId,creatureId:action.creature_id,level:action.level||'SEEN',facts:Array.isArray(action.facts)?action.facts:[]});
  throw Object.assign(new Error('AI-Мастер запросил неподдерживаемое игровое действие'),{status:400});
}

async function saveMasterMessage({campaignId,characterId,narrative,metadata={}}) {
  return transaction(async(client)=>{
    const {rows}=await client.query(`INSERT INTO messages(campaign_id,character_id,role,body,metadata) VALUES($1::uuid,$2::uuid,'MASTER',$3,$4) RETURNING *`,[campaignId,characterId,narrative,metadata]);
    await client.query(`INSERT INTO game_events(campaign_id,actor_character_id,event_type,aggregate_type,aggregate_id,payload) VALUES($1::uuid,$2::uuid,'MASTER_RESPONSE','CHARACTER',$2::uuid,$3)`,[campaignId,characterId,{responseId:rows[0].id,...metadata}]);
    return rows[0];
  });
}

export async function handlePlayerMessage({campaignId,characterId,body}) {
  const context=await contextFor(characterId,campaignId);
  await pool.query(`INSERT INTO messages(campaign_id,character_id,role,body) VALUES($1::uuid,$2::uuid,'PLAYER',$3)`,[campaignId,characterId,body]);
  context.recentMessages.push({role:'PLAYER',body});
  const result=await askModel([{role:'system',content:RULES},{role:'system',content:`АКТУАЛЬНОЕ СОСТОЯНИЕ ИГРЫ:\n${JSON.stringify(context)}`},{role:'user',content:body}]);
  const pendingRoll=normalizeRoll(context.character,result.pending_roll);
  const action=result.action||null;
  let actionResult=null;
  if(action&&!pendingRoll)actionResult=await executeAction({campaignId,characterId,action});
  const master=await saveMasterMessage({campaignId,characterId,narrative:String(result.narrative||'Мастер ожидает вашего действия.'),metadata:{ai:true,pendingRoll,action:action&&!pendingRoll?action:null,actionResult:actionResult?{eventId:actionResult.event?.id||null}:null}});
  return {player:{body,role:'PLAYER'},master,pendingRoll};
}

export async function handleRoll({campaignId,characterId,masterMessageId}) {
  const context=await contextFor(characterId,campaignId);
  const message=(await pool.query(`SELECT id,metadata FROM messages WHERE id=$1::uuid AND campaign_id=$2::uuid AND character_id=$3::uuid AND role='MASTER'`,[masterMessageId,campaignId,characterId])).rows[0];
  const pending=message?.metadata?.pendingRoll;
  if(!pending)throw Object.assign(new Error('Этот бросок уже выполнен или больше не доступен'),{status:409});
  const rollSpec=normalizeRoll(context.character,pending);
  const rolled=rollDice(`1d${rollSpec.sides}`);
  const total=rolled.diceTotal+rollSpec.modifier;
  const success=total>=rollSpec.dc;
  const {rows}=await pool.query(`INSERT INTO dice_rolls(campaign_id,character_id,notation,dice_total,modifier,total,reason) VALUES($1::uuid,$2::uuid,$3,$4,$5,$6,$7) RETURNING *`,[campaignId,characterId,rollSpec.notation,rolled.diceTotal,rollSpec.modifier,total,rollSpec.reason]);
  await pool.query(`INSERT INTO game_events(campaign_id,actor_character_id,event_type,aggregate_type,aggregate_id,payload) VALUES($1::uuid,$2::uuid,'DICE_ROLL','CHARACTER',$2::uuid,$3)`,[campaignId,characterId,{rollId:rows[0].id,...rollSpec,die:rolled.diceTotal,total,success}]);
  await pool.query(`UPDATE messages SET metadata=jsonb_set(metadata,'{pendingRoll}','null'::jsonb) WHERE id=$1::uuid`,[masterMessageId]);
  const followup=await askModel([{role:'system',content:RULES},{role:'system',content:`АКТУАЛЬНОЕ СОСТОЯНИЕ ИГРЫ:\n${JSON.stringify(context)}`},{role:'system',content:`ИГРОВОЙ ДВИЖОК УЖЕ ВЫПОЛНИЛ БРОСОК ПОСЛЕ ЯВНОГО ДЕЙСТВИЯ ИГРОКА. Нельзя менять или придумывать результат. Проверка: ${JSON.stringify(rollSpec)}. Выпало: ${rolled.diceTotal}. Итог: ${total}. Успех: ${success}. Теперь опиши последствия. Новый бросок не запрашивай в этом ответе.`},{role:'user',content:'Продолжи сцену после результата проверки.'}]);
  let actionResult=null;
  if(followup.action)actionResult=await executeAction({campaignId,characterId,action:followup.action});
  const master=await saveMasterMessage({campaignId,characterId,narrative:String(followup.narrative||'Мастер продолжает повествование.'),metadata:{ai:true,roll:{...rollSpec,die:rolled.diceTotal,total,success},action:followup.action||null,actionResult:actionResult?{eventId:actionResult.event?.id||null}:null}});
  return {master,roll:{...rows[0],dice:rolled.dice,...rollSpec,success},pendingRoll:null};
}
