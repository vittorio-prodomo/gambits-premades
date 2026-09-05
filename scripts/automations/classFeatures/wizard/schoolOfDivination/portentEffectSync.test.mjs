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

/* Queue T217 — the refresh block ends in a stamped marker; the rest-time wipe must strip
   yesterday's dice and leave a refresh that just ran alone. */
import {portentMarker, portentFeatureText, portentRefreshAge, stripPortentDice, isFreshRefresh, activityIdentifier} from './portentEffectSync.mjs';

const FEATURE = '<p>You can see glimpses of the future.</p>';
const block = (vals, now) => 'Your portent rolls are:<br><br>' + desc(vals) + '<br>' + portentMarker(now) + FEATURE;

test('the feature text survives after the marker, stamped or not', () => {
    assert.equal(portentFeatureText(block([7, 15], 1000)), FEATURE);
    assert.equal(portentFeatureText('<div id="endPortentRolls"></div>' + FEATURE), FEATURE);
    assert.equal(portentFeatureText(FEATURE), FEATURE, 'no marker at all → the whole text is the feature');
});

test('a stamped block reports its age; an unstamped (legacy) block reports null', () => {
    assert.equal(portentRefreshAge(block([7, 15], 1000), 5000), 4000);
    assert.equal(portentRefreshAge('<div id="endPortentRolls"></div>' + FEATURE, 5000), null);
    assert.equal(portentRefreshAge(FEATURE, 5000), null);
});

test('stripping removes the dice and leaves a bare marker + the feature text', () => {
    const stripped = stripPortentDice(block([7, 15], 1000));
    assert.equal(stripped, '<div id="endPortentRolls"></div>' + FEATURE);
    assert.deepEqual(currentPortentDice(stripped), []);
});

test('stripping a legacy (unstamped) block works too — the live item today', () => {
    const legacy = 'Your portent rolls are:<br><br>' + desc([3, 12]) + '<br><div id="endPortentRolls"></div>' + FEATURE;
    assert.equal(stripPortentDice(legacy), '<div id="endPortentRolls"></div>' + FEATURE);
});

test('stripping a description with nothing to strip returns it unchanged', () => {
    assert.equal(stripPortentDice(FEATURE), FEATURE);
});

test('a refresh written seconds ago is fresh; yesterday\'s is not; legacy is not', () => {
    const now = 10_000_000;
    assert.equal(isFreshRefresh(block([7, 15], now - 15_000), now), true, 'the auto-use that just ran');
    assert.equal(isFreshRefresh(block([7, 15], now - 8 * 3600 * 1000), now), false, 'last night');
    assert.equal(isFreshRefresh('<div id="endPortentRolls"></div>' + FEATURE, now), false);
    assert.equal(isFreshRefresh(block([7, 15], now + 5000), now), false, 'a stamp from the future is not trusted');
});

test('activity identifier: midi\'s field first, then a name slug, never undefined', () => {
    assert.equal(activityIdentifier({identifier: 'portentRefresh', name: 'Anything'}), 'portentRefresh');
    assert.equal(activityIdentifier({identifier: undefined, name: 'Refresh Portent Dice'}), 'refreshportentdice');
    assert.equal(activityIdentifier(undefined), '');
});
