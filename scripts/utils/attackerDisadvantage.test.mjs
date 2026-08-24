import test from 'node:test';
import assert from 'node:assert/strict';
import {attackerHasDisadvantageFlags} from './attackerDisadvantage.mjs';

/*
 * Queue T150: GPS's Protection gate already suppresses the offer when
 * `workflow.tracker.hasDisadvantage` is set — but Sap delivers its disadvantage through the
 * attacker's own `flags.midi-qol.disadvantage.attack.*` (applied by an ActiveEffect change), which
 * the tracker does not yet reflect at offer time. This helper reads the attacker's EVALUATED actor
 * flags (DAE has already folded effect changes into them by prepareData) so the pre-roll gate can
 * see Sap-shaped disadvantage.
 */

const actorWith = flags => ({flags: {'midi-qol': flags}});

test('detects disadvantage.attack.all (the Sap shape)', () => {
    assert.equal(attackerHasDisadvantageFlags(actorWith({disadvantage: {attack: {all: 1}}})), true);
});

test('detects disadvantage.attack.mwak', () => {
    assert.equal(attackerHasDisadvantageFlags(actorWith({disadvantage: {attack: {mwak: 1}}})), true);
});

test('string "1" values (effect changes are strings) count as set', () => {
    assert.equal(attackerHasDisadvantageFlags(actorWith({disadvantage: {attack: {all: '1'}}})), true);
});

test('a "0" or empty value does not count', () => {
    assert.equal(attackerHasDisadvantageFlags(actorWith({disadvantage: {attack: {all: '0'}}})), false);
    assert.equal(attackerHasDisadvantageFlags(actorWith({disadvantage: {attack: {all: ''}}})), false);
});

test('no midi flags at all is false, not a crash', () => {
    assert.equal(attackerHasDisadvantageFlags({flags: {}}), false);
    assert.equal(attackerHasDisadvantageFlags(undefined), false);
});

test('ranged-only disadvantage does not suppress a melee-triggered Protection offer', () => {
    // Protection reacts to melee attacks; rwak-only disadvantage is not relevant to the gate.
    assert.equal(attackerHasDisadvantageFlags(actorWith({disadvantage: {attack: {rwak: 1}}}), ['all', 'mwak']), false);
});
