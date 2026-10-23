import test from 'node:test';
import assert from 'node:assert/strict';
import {spellSlotRefund} from './counterspellRefund.mjs';

const actor = {system: {spells: {spell1: {value: 1}, spell3: {value: 0}, pact: {value: 0}}}};
const get = keyPath => keyPath.split('.').reduce((o, k) => o?.[k], actor);

test('a countered spell gets its slot back (dnd5e 5 records the spend as a negative delta)', () => {
    const {updates, remaining} = spellSlotRefund({actor: [{keyPath: 'system.spells.spell1.value', delta: -1}]}, get);
    assert.deepEqual(updates, {'system.spells.spell1.value': 2});
    assert.deepEqual(remaining, []);
});

test('a pact slot comes back too', () => {
    const {updates} = spellSlotRefund({actor: [{keyPath: 'system.spells.pact.value', delta: -1}]}, get);
    assert.deepEqual(updates, {'system.spells.pact.value': 1});
});

test('only the slot is refunded — other spending stays recorded on the card', () => {
    const other = {keyPath: 'system.resources.primary.value', delta: -1};
    const {updates, remaining} = spellSlotRefund({actor: [{keyPath: 'system.spells.spell3.value', delta: -1}, other]}, get);
    assert.deepEqual(updates, {'system.spells.spell3.value': 1});
    assert.deepEqual(remaining, [other]);
});

test('nothing spent, nothing refunded', () => {
    assert.deepEqual(spellSlotRefund(null, get), {updates: {}, remaining: []});
    assert.deepEqual(spellSlotRefund({actor: []}, get), {updates: {}, remaining: []});
    assert.deepEqual(spellSlotRefund({item: {}}, get), {updates: {}, remaining: []});
});
