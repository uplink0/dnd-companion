import { Router } from 'express';
import { z } from 'zod';
import { pool, transaction } from './db.js';

export const characterApi = Router();

const RACES = {
  'Человек': { str:1, dex:1, con:1, int:1, wis:1, cha:1 },
  'Высший эльф': { dex:1, int:2 },
  'Дварф': { con:2 },
  'Дроу': { dex:1, cha:2 },
  'Полуорк': { str:2, con:1 },
  'Полурослик': { dex:2 }
};

const CLASSES = {
  'Воин': { str:1, con:1, hitDie:10 },
  'Следопыт': { dex:1, wis:1, hitDie:10 },
  'Вор': { dex:1, cha:1, hitDie:8 },
  'Чародей': { int:1, cha:1, hitDie:6 },
  'Волшебник': { int:1, wis:1, hitDie:6 },
  'Жрец': { wis:1, con:1, hitDie:8 },
  'Паладин': { str:1, cha:1, hitDie:10 },
  'Варвар': { str:1, con:1, hitDie:12 }
};

const NAMES = [
  'Аэлин Туманный Ветер','Каэль Рунный Страж','Мира Воронья Тень','Торвин Каменный Щит',
  'Элиана Серебряная Звезда','Рагнар Пепельный Клинок','Лиора Зимний Свет','Дарек Чёрный След',
  'Нэриэль Лунная Искра','Бринн Железное Сердце','Сайрен Осколок Ночи','Вальтер Пламенный Взор'
];
const BACKGROUNDS = ['Искатель древностей','Странник','Бывший наёмник','Ученик мага','Охотник на чудовищ','Наследник забытого рода'];
const STAT_KEYS = ['str','dex','con','int','wis','cha'];

const modifier = (score) => Math.floor((Number(score) - 10) / 2);

function validateBaseAbilities(value) {
  const abilities = z.object({
    str:z.number().int().min(1).max(18), dex:z.number().int().min(1).max(18),
    con:z.number().int().min(1).max(18), int:z.number().int().min(1).max(18),
    wis:z.number().int().min(1).max(18), cha:z.number().int().min(1).max(18)
  }).parse(value);
  const total = STAT_KEYS.reduce((sum,key) => sum + abilities[key], 0);
  if (total !== 72) throw Object.assign(new Error(`Ровно 72 очка характеристик. Сейчас: ${total}`), { status:400 });
  return abilities;
}

function randomAbilities() {
  const abilities = Object.fromEntries(STAT_KEYS.map((key) => [key,1]));
  let remaining = 66;
  while (remaining > 0) {
    const available = STAT_KEYS.filter((key) => abilities[key] < 18);
    const key = available[Math.floor(Math.random() * available.length)];
    abilities[key] += 1;
    remaining -= 1;
  }
  return abilities;
}

function applyBonuses(base, race, className) {
  const result = Object.fromEntries(STAT_KEYS.map((key) => [key, Number(base[key])]));
  for (const [key,value] of Object.entries(RACES[race] || {})) result[key] += value;
  for (const [key,value] of Object.entries(CLASSES[className] || {})) {
    if (key !== 'hitDie') result[key] += value;
  }
  return result;
}

function derived(base, race, className) {
  const abilities = applyBonuses(base, race, className);
  const classData = CLASSES[className] || CLASSES['Воин'];
  const conMod = modifier(abilities.con);
  const dexMod = modifier(abilities.dex);
  const spellAbility = ['Чародей','Волшебник'].includes(className) ? 'int' : className === 'Жрец' ? 'wis' : className === 'Паладин' ? 'cha' : null;
  return {
    abilities,
    hpMax: Math.max(1, classData.hitDie + conMod),
    armorClass: 10 + dexMod,
    initiative: dexMod,
    proficiencyBonus: 2,
    spellSaveDc: spellAbility ? 8 + 2 + modifier(abilities[spellAbility]) : null,
    spellAttackBonus: spellAbility ? 2 + modifier(abilities[spellAbility]) : null,
    hitDice: `1d${classData.hitDie}`
  };
}

function draft() {
  const race = Object.keys(RACES)[Math.floor(Math.random() * Object.keys(RACES).length)];
  const className = Object.keys(CLASSES)[Math.floor(Math.random() * Object.keys(CLASSES).length)];
  const abilities = randomAbilities();
  const stats = derived(abilities, race, className);
  const name = NAMES[Math.floor(Math.random() * NAMES.length)];
  const background = BACKGROUNDS[Math.floor(Math.random() * BACKGROUNDS.length)];
  return {
    name, race, className, background, rank:'Новичок', abilities,
    biography:`Герой ${name} отправился в путь после странного знака, который нельзя было игнорировать. Его история начинается у границы забытых руин.`,
    ...stats
  };
}

async function createCharacter(campaignId, input) {
  const baseAbilities = validateBaseAbilities(input.abilities);
  const stats = derived(baseAbilities, input.race, input.className);
  return transaction(async (client) => {
    const campaign = (await client.query('SELECT owner_id FROM campaigns WHERE id=$1', [campaignId])).rows[0];
    if (!campaign) throw Object.assign(new Error('Кампания не найдена'), { status:404 });
    const result = (await client.query(`INSERT INTO characters(
      campaign_id,user_id,kind,name,race,class_name,background,rank,level,xp,xp_next,hp,hp_max,armor_class,
      initiative,proficiency_bonus,spell_save_dc,spell_attack_bonus,hit_dice,abilities,biography
    ) VALUES($1,$2,'PLAYER',$3,$4,$5,$6,'Новичок',1,0,300,$7,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,[
      campaignId,campaign.owner_id,input.name,input.race,input.className,input.background || '',stats.hpMax,stats.armorClass,
      stats.initiative,stats.proficiencyBonus,stats.spellSaveDc,stats.spellAttackBonus,stats.hitDice,stats.abilities,
      input.biography || `Герой ${input.name} начинает свой путь в неизвестности.`
    ])).rows[0];
    await client.query('INSERT INTO party_members(campaign_id,character_id,recruitment_type) VALUES($1,$2,\'START\')', [campaignId,result.id]);
    await client.query(`INSERT INTO game_events(campaign_id,actor_character_id,event_type,aggregate_type,aggregate_id,payload)
      VALUES($1,$2,'CHARACTER_CREATED','CHARACTER',$2,$3)`, [campaignId,result.id,{name:result.name,race:result.race,className:result.class_name,baseAbilities}]);
    return result;
  });
}

characterApi.get('/', async (req,res) => {
  const campaignId = String(req.query.campaignId || '10000000-0000-4000-8000-000000000001');
  const { rows } = await pool.query(`SELECT id,name,race,class_name,rank,level,xp,xp_next,hp,hp_max,armor_class,initiative,abilities,biography,kind,created_at
    FROM characters WHERE campaign_id=$1 AND kind='PLAYER' ORDER BY created_at`, [campaignId]);
  res.json(rows);
});

characterApi.post('/generate', async (req,res) => res.json(draft()));

characterApi.post('/', async (req,res) => {
  const input = z.object({
    campaignId:z.string().uuid(), name:z.string().trim().min(2).max(80),
    race:z.string().refine((value)=>value in RACES,'Неизвестная раса'),
    className:z.string().refine((value)=>value in CLASSES,'Неизвестный класс'),
    background:z.string().trim().max(120).optional(), biography:z.string().trim().max(2000).optional(),
    abilities:z.record(z.number().int()).refine((value)=>Object.keys(value).length===6,'Нужно шесть характеристик')
  }).parse(req.body);
  const character = await createCharacter(input.campaignId,input);
  res.status(201).json(character);
});

export { RACES, CLASSES };
