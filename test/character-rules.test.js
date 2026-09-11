import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLASSES,
  RACES,
  applyBonuses,
  deriveStats,
  generateDraft,
  validateBaseAbilities
} from '../server/character-rules.js';

test('базовые характеристики принимают ровно 72 очка и ограничены диапазоном 1–18', () => {
  const base = { str: 12, dex: 12, con: 12, int: 12, wis: 12, cha: 12 };
  assert.deepEqual(validateBaseAbilities(base), base);
  assert.throws(() => validateBaseAbilities({ ...base, cha: 13 }), /72/);
  assert.throws(() => validateBaseAbilities({ ...base, cha: 0 }), /от 1 до 18/);
  assert.throws(() => validateBaseAbilities({ ...base, cha: 19 }), /от 1 до 18/);
});

test('расовые и классовые бонусы применяются после проверки базовых очков', () => {
  const base = { str: 18, dex: 12, con: 10, int: 10, wis: 10, cha: 12 };
  const final = applyBonuses(base, 'Полуорк', 'Воин');
  assert.equal(final.str, 21);
  assert.equal(final.con, 12);
  assert.equal(final.dex, 12);
});

test('производные характеристики рассчитываются единообразно', () => {
  const base = { str: 12, dex: 12, con: 12, int: 12, wis: 12, cha: 12 };
  const stats = deriveStats(base, 'Высший эльф', 'Волшебник');
  assert.equal(stats.hpMax, CLASSES['Волшебник'].hitDie + 1);
  assert.equal(stats.armorClass, 11);
  assert.equal(stats.spellSaveDc, 12);
  assert.equal(stats.spellAttackBonus, 4);
});

test('генератор выдаёт валидную базу, существующую расу и класс', () => {
  const draft = generateDraft();
  const base = validateBaseAbilities(draft.baseAbilities);
  const total = Object.values(base).reduce((sum, value) => sum + value, 0);
  assert.equal(total, 72);
  assert.ok(draft.race in RACES);
  assert.ok(draft.className in CLASSES);
  assert.deepEqual(draft.abilities, applyBonuses(base, draft.race, draft.className));
});
