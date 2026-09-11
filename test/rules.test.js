import test from 'node:test';
import assert from 'node:assert/strict';
import { abilityModifier, derivedCharacter, rollDice } from '../server/rules.js';

test('модификаторы характеристик соответствуют D&D 5e', () => {
  assert.equal(abilityModifier(8),-1); assert.equal(abilityModifier(10),0); assert.equal(abilityModifier(18),4);
});
test('временные хиты и прогресс вычисляются отдельно', () => {
  const value=derivedCharacter({hp:10,hp_max:20,xp:150,xp_next:300,abilities:{wis:14},skill_proficiencies:{perception:true},proficiency_bonus:2});
  assert.equal(value.bloodied,true); assert.equal(value.passivePerception,14); assert.equal(value.xpProgress,50);
});
test('бросок кубиков соблюдает диапазон', () => {
  const roll=rollDice('2d6+3'); assert.equal(roll.dice.length,2); assert.ok(roll.total>=5 && roll.total<=15);
});
