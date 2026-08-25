import test from 'node:test';
import assert from 'node:assert/strict';
import {currentPortentDice, portentEffectPatch, isPortentEffectName} from './portentEffectSync.mjs';

/* Queue T155 — the shapes below mirror exactly what portent.js writes into the item
   description on refresh (`<b><span id="portentRollN">NN</span></b>`) and what remains
   after the use-dialog strips a die's whole div. */

const desc = (vals) => vals.map((v, i) =>
    `<div id="Portent Roll ${i + 1}">- Portent Roll ${i + 1}: <b><span id="portentRoll${i + 1}">${v}</span></b></div>`).join('');

test('extracts both fresh dice in order', () => {
    assert.deepEqual(currentPortentDice(desc([7, 15])), ['7', '15']);
});

test('extracts three dice at wizard 14+', () => {
    assert.deepEqual(currentPortentDice(desc([1, 20, 11])), ['1', '20', '11']);
});

test('one die left after a spend', () => {
    assert.deepEqual(currentPortentDice(desc([15])), ['15']);
});

test('no dice → empty list (spent-out description, or the marker only)', () => {
    assert.deepEqual(currentPortentDice('<br><div id="endPortentRolls"></div><p>feature text</p>'), []);
    assert.deepEqual(currentPortentDice(''), []);
    assert.deepEqual(currentPortentDice(undefined), []);
});

test('a bare span without the bold wrapper still parses', () => {
    assert.deepEqual(currentPortentDice('<span id="portentRoll1">9</span>'), ['9']);
});

test('patch composes the suffixed title while dice remain', () => {
    const p = portentEffectPatch('Portent', ['7', '15'], {activeText: 'A', emptyText: 'E'});
    assert.equal(p.name, 'Portent (7, 15)');
    assert.equal(p.description, 'A');
});

test('patch reverts to the bare name when spent out', () => {
    const p = portentEffectPatch('Portent', [], {activeText: 'A', emptyText: 'E'});
    assert.equal(p.name, 'Portent');
    assert.equal(p.description, 'E');
});

test('effect lookup matches the bare and the suffixed name, not lookalikes', () => {
    assert.equal(isPortentEffectName('Portent', 'Portent'), true);
    assert.equal(isPortentEffectName('Portent (7, 15)', 'Portent'), true);
    assert.equal(isPortentEffectName('Portentous Omen', 'Portent'), false);
    assert.equal(isPortentEffectName(undefined, 'Portent'), false);
});
