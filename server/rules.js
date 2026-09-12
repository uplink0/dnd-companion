import crypto from 'node:crypto';

export const abilityModifier = (score) => Math.floor((Number(score) - 10) / 2);

export function rollDice(notation, legacyModifier) {
  const normalizedNotation = Number.isInteger(Number(notation))
    ? `1d${Number(notation)}${Number(legacyModifier || 0) >= 0 ? '+' : ''}${Number(legacyModifier || 0)}`
    : notation;
  const match = /^(\d+)d(\d+)(?:([+-])(\d+))?$/.exec(String(normalizedNotation).replace(/\s/g, ''));
  if (!match) throw new Error('Допустимый формат броска: NdM+K');
  const count = Number(match[1]);
  const sides = Number(match[2]);
  const modifier = match[3] ? Number(`${match[3]}${match[4]}`) : 0;
  if (count < 1 || count > 100 || sides < 2 || sides > 1000) throw new Error('Недопустимые параметры кубиков');
  const dice = Array.from({ length: count }, () => crypto.randomInt(1, sides + 1));
  return { notation: normalizedNotation, dice, diceTotal: dice.reduce((sum, value) => sum + value, 0), modifier, total: dice.reduce((sum, value) => sum + value, modifier) };
}

export function derivedCharacter(character) {
  const abilities = character.abilities || {};
  return {
    ...character,
    abilityModifiers: Object.fromEntries(Object.entries(abilities).map(([key, value]) => [key, abilityModifier(value)])),
    passivePerception: 10 + abilityModifier(abilities.wis ?? 10) + (character.skill_proficiencies?.perception ? character.proficiency_bonus : 0),
    bloodied: character.hp <= character.hp_max / 2,
    unconscious: character.hp === 0,
    xpProgress: Math.min(100, Math.round((character.xp / character.xp_next) * 100))
  };
}
