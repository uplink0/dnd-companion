const ITEM_TYPES = new Set(['CONSUMABLE','WEAPON','ARMOR','SHIELD','TOOL','ADVENTURING_GEAR','FOOD','QUEST_ITEM','MAGIC_ITEM','MISC']);
const RARITIES = ['COMMON','UNCOMMON','RARE','VERY_RARE','LEGENDARY'];
const MAX_RARITY_BY_LEVEL = { 1:'COMMON', 2:'COMMON', 3:'UNCOMMON', 4:'UNCOMMON', 5:'UNCOMMON', 6:'RARE', 7:'RARE', 8:'RARE', 9:'RARE', 10:'RARE', 11:'VERY_RARE', 12:'VERY_RARE', 13:'VERY_RARE', 14:'VERY_RARE', 15:'VERY_RARE', 16:'VERY_RARE', 17:'LEGENDARY', 18:'LEGENDARY', 19:'LEGENDARY', 20:'LEGENDARY' };
const MAX_HEAL_FORMULA = { COMMON:'1d4+1', UNCOMMON:'2d4+2', RARE:'4d4+4', VERY_RARE:'6d4+6', LEGENDARY:'8d4+8' };

function normalizeRarity(value, level) {
  const requested = String(value || 'COMMON').toUpperCase();
  const requestedIndex = Math.max(0, RARITIES.indexOf(requested));
  const maxIndex = Math.max(0, RARITIES.indexOf(MAX_RARITY_BY_LEVEL[Math.max(1, Math.min(20, Number(level) || 1))]));
  return RARITIES[Math.min(requestedIndex, maxIndex)];
}

function normalizeProperties(properties, type, rarity) {
  const list = Array.isArray(properties) ? properties : [];
  if (type === 'CONSUMABLE') {
    return list.filter((p) => p && typeof p === 'object').map((p) => ({
      key: String(p.key || 'effect').slice(0, 60),
      value: String(p.value || '').slice(0, 120),
      formula: p.formula ? String(p.formula).slice(0, 30) : undefined,
      secret: p.secret === true
    })).slice(0, 8);
  }
  return list.filter((p) => p && typeof p === 'object').map((p) => ({
    key: String(p.key || 'property').slice(0, 60),
    value: String(p.value || '').slice(0, 160),
    secret: p.secret === true
  })).slice(0, 12);
}

function normalizeDamageFormula(formula, rarity) {
  const fallback = { COMMON:'1d6', UNCOMMON:'1d8', RARE:'1d10', VERY_RARE:'2d6', LEGENDARY:'2d8' }[rarity];
  const match = String(formula || '').trim().match(/^(\d{1,2})d(4|6|8|10|12)(?:\+(\d{1,2}))?$/i);
  if (!match) return fallback;
  const count = Number(match[1]);
  const sides = Number(match[2]);
  const bonus = Number(match[3] || 0);
  const maxCount = rarity === 'COMMON' ? 1 : rarity === 'UNCOMMON' ? 2 : rarity === 'RARE' ? 2 : 3;
  const maxBonus = rarity === 'COMMON' ? 2 : rarity === 'UNCOMMON' ? 3 : rarity === 'RARE' ? 4 : 6;
  return `${Math.min(count, maxCount)}d${sides}${bonus ? `+${Math.min(bonus, maxBonus)}` : ''}`;
}

export function buildItemSpec(input, characterLevel = 1) {
  const type = String(input?.item_type || input?.type || 'MISC').toUpperCase();
  if (!ITEM_TYPES.has(type)) throw new Error('Недопустимый тип предмета');
  const rarity = normalizeRarity(input?.rarity, characterLevel);
  const properties = normalizeProperties(input?.properties, type, rarity);
  const material = String(input?.material || '').trim().slice(0, 60);
  const weight = Math.max(0, Math.min(50, Number(input?.weight || 0)));
  const value = Math.max(0, Math.min(10000, Number(input?.base_value_gp || input?.value || 0)));
  const spec = {
    name: String(input?.name || 'Найденный предмет').trim().slice(0, 120),
    item_type: type,
    rarity,
    description: String(input?.description || '').trim().slice(0, 1000),
    weight,
    base_value_gp: value,
    consumable: type === 'CONSUMABLE',
    stackable: input?.stackable !== false && ['CONSUMABLE','FOOD','ADVENTURING_GEAR','MISC'].includes(type),
    properties
  };
  if (material) spec.properties.push({ key:'material', value:material });
  if (type === 'CONSUMABLE') {
    const heal = properties.find((p) => p.key === 'heal');
    if (heal) heal.formula = MAX_HEAL_FORMULA[rarity];
  }
  if (type === 'WEAPON') {
    const damage = properties.find((p) => p.key === 'damage');
    if (damage) damage.value = normalizeDamageFormula(damage.value, rarity);
  }
  if (type === 'ARMOR') {
    const ac = properties.find((p) => p.key === 'armor_class');
    if (ac) ac.value = String(Math.min(20, Math.max(10, Number(ac.value) || 10)));
  }
  return spec;
}

export async function createItem(client, { campaignId, characterLevel, item }) {
  const spec = buildItemSpec(item, characterLevel);
  const { rows } = await client.query(`
    INSERT INTO items(campaign_id,name,item_type,rarity,description,weight,base_value_gp,consumable,stackable,properties)
    VALUES($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
    RETURNING *`, [campaignId,spec.name,spec.item_type,spec.rarity,spec.description,spec.weight,spec.base_value_gp,spec.consumable,spec.stackable,JSON.stringify(spec.properties)]);
  return rows[0];
}
