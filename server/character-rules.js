export const STAT_KEYS = ['str','dex','con','int','wis','cha'];

export const RACES = {
  'Человек': { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 },
  'Высший эльф': { dex: 1, int: 2 },
  'Дварф': { con: 2 },
  'Дроу': { dex: 1, cha: 2 },
  'Полуорк': { str: 2, con: 1 },
  'Полурослик': { dex: 2 }
};

export const CLASSES = {
  'Воин': { hitDie: 10, spellAbility: null, bonuses: { str: 1, con: 1 } },
  'Следопыт': { hitDie: 10, spellAbility: null, bonuses: { dex: 1, wis: 1 } },
  'Вор': { hitDie: 8, spellAbility: null, bonuses: { dex: 1, cha: 1 } },
  'Чародей': { hitDie: 6, spellAbility: 'cha', bonuses: { int: 1, cha: 1 } },
  'Волшебник': { hitDie: 6, spellAbility: 'int', bonuses: { int: 1, wis: 1 } },
  'Жрец': { hitDie: 8, spellAbility: 'wis', bonuses: { wis: 1, con: 1 } },
  'Паладин': { hitDie: 10, spellAbility: 'cha', bonuses: { str: 1, cha: 1 } },
  'Варвар': { hitDie: 12, spellAbility: null, bonuses: { str: 1, con: 1 } }
};

export const BACKGROUNDS = [
  'Искатель древностей',
  'Странник',
  'Бывший наёмник',
  'Ученик мага',
  'Охотник на чудовищ',
  'Наследник забытого рода'
];

export const NAMES = [
  'Аэлин Туманный Ветер',
  'Каэль Рунный Страж',
  'Мира Воронья Тень',
  'Торвин Каменный Щит',
  'Элиана Серебряная Звезда',
  'Рагнар Пепельный Клинок',
  'Лиора Зимний Свет',
  'Дарек Чёрный След',
  'Нэриэль Лунная Искра',
  'Бринн Железное Сердце',
  'Сайрен Осколок Ночи',
  'Вальтер Пламенный Взор'
];

export const abilityModifier = (score) => Math.floor((Number(score) - 10) / 2);

export function validateBaseAbilities(input) {
  const abilities = Object.fromEntries(
    STAT_KEYS.map((key) => [key, Number(input?.[key])])
  );

  const invalid = STAT_KEYS.find(
    (key) => !Number.isInteger(abilities[key]) || abilities[key] < 1 || abilities[key] > 18
  );
  if (invalid) {
    throw Object.assign(
      new Error(`Базовая ${invalid.toUpperCase()} должна быть целым числом от 1 до 18`),
      { status: 400 }
    );
  }

  const total = STAT_KEYS.reduce((sum, key) => sum + abilities[key], 0);
  if (total !== 72) {
    throw Object.assign(new Error(`Нужно ровно 72 базовых очка. Сейчас: ${total}`), { status: 400 });
  }

  return abilities;
}

export function randomBaseAbilities() {
  const abilities = Object.fromEntries(STAT_KEYS.map((key) => [key, 1]));
  let remaining = 66;

  while (remaining > 0) {
    const available = STAT_KEYS.filter((key) => abilities[key] < 18);
    const key = available[Math.floor(Math.random() * available.length)];
    abilities[key] += 1;
    remaining -= 1;
  }

  return abilities;
}

export function bonusMap(race, className) {
  return Object.fromEntries(
    STAT_KEYS.map((key) => [
      key,
      (RACES[race]?.[key] || 0) + (CLASSES[className]?.bonuses?.[key] || 0)
    ])
  );
}

export function applyBonuses(base, race, className) {
  const bonuses = bonusMap(race, className);
  return Object.fromEntries(STAT_KEYS.map((key) => [key, Number(base[key]) + bonuses[key]]));
}

export function deriveStats(base, race, className) {
  const classData = CLASSES[className];
  if (!classData) throw Object.assign(new Error('Неизвестный класс'), { status: 400 });

  const abilities = applyBonuses(base, race, className);
  const conMod = abilityModifier(abilities.con);
  const dexMod = abilityModifier(abilities.dex);
  const spellMod = classData.spellAbility
    ? abilityModifier(abilities[classData.spellAbility])
    : null;

  return {
    abilities,
    hpMax: Math.max(1, classData.hitDie + conMod),
    armorClass: 10 + dexMod,
    initiative: dexMod,
    proficiencyBonus: 2,
    spellSaveDc: classData.spellAbility ? 10 + spellMod : null,
    spellAttackBonus: classData.spellAbility ? 2 + spellMod : null,
    hitDice: `1d${classData.hitDie}`
  };
}

export function generateDraft() {
  const races = Object.keys(RACES);
  const classes = Object.keys(CLASSES);
  const race = races[Math.floor(Math.random() * races.length)];
  const className = classes[Math.floor(Math.random() * classes.length)];
  const baseAbilities = randomBaseAbilities();
  const stats = deriveStats(baseAbilities, race, className);
  const name = NAMES[Math.floor(Math.random() * NAMES.length)];
  const background = BACKGROUNDS[Math.floor(Math.random() * BACKGROUNDS.length)];
  const classBonuses = CLASSES[className].bonuses;

  return {
    name,
    race,
    className,
    background,
    rank: 'Новичок',
    abilities: stats.abilities,
    baseAbilities,
    raceBonuses: RACES[race],
    classBonuses,
    total: 72,
    biography: `Герой ${name} отправился в путь после странного знака, который нельзя было игнорировать. Его история начинается у границы забытых руин.`,
    ...stats
  };
}
