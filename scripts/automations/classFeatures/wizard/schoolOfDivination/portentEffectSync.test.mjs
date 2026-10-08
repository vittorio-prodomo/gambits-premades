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

/* Queue T234 — menu, hand entry, long-rest prompt. */
import {portentDiceBlock, parsePortentInput, isSpendIdentifier, isHudOrigin, isRestActivation} from './portentEffectSync.mjs';

test('the dice block matches what the reader parses, numbered without gaps', () => {
    const html = portentDiceBlock([7, 15], {header: 'Your portent rolls are:<br><br>', label: (i) => `- Portent Roll ${i}:`, now: 1234});
    assert.deepEqual(currentPortentDice(html), ['7', '15']);
    assert.ok(html.startsWith('Your portent rolls are:<br><br><div id="Portent Roll 1">- Portent Roll 1: <b><span id="portentRoll1">7</span></b></div>'));
    assert.ok(html.endsWith('<br><div id="endPortentRolls" data-refreshed="1234"></div>'));
    assert.equal(isFreshRefresh(html, 2000), true);
    assert.equal(portentFeatureText(html + FEATURE), FEATURE);
});

test('hand entry: whole numbers 1–20, an empty field is a die that does not exist', () => {
    assert.deepEqual(parsePortentInput(['7', '15']), {values: [7, 15], error: null});
    assert.deepEqual(parsePortentInput([' 20 ', '']), {values: [20], error: null});
    assert.deepEqual(parsePortentInput(['', '1', '']), {values: [1], error: null});
    assert.deepEqual(parsePortentInput([3, 12]), {values: [3, 12], error: null});
});

test('hand entry: out of range, fractions, signs and text are refused; all-empty is refused', () => {
    for (const bad of ['0', '21', '-3', '7.5', 'abc', '1e1']) {
        assert.equal(parsePortentInput(['5', bad]).error, 'range', bad);
    }
    assert.equal(parsePortentInput(['', '  ']).error, 'empty');
    assert.equal(parsePortentInput([]).error, 'empty');
    assert.equal(parsePortentInput(undefined).error, 'empty');
});

test('the spend activity is whatever is not plumbing', () => {
    assert.equal(isSpendIdentifier(''), true);
    assert.equal(isSpendIdentifier('use'), true);
    assert.equal(isSpendIdentifier('portentRefresh'), false);
    assert.equal(isSpendIdentifier('portentSet'), false);
    assert.equal(isSpendIdentifier('syntheticRoll'), false);
});

test('a click inside the Argon HUD is recognised; a sheet click or no event is not', () => {
    const inside = {closest: (sel) => (sel === '.extended-combat-hud' ? {} : null)};
    const outside = {closest: () => null};
    assert.equal(isHudOrigin({currentTarget: inside}), true);
    assert.equal(isHudOrigin({target: inside}), true);
    assert.equal(isHudOrigin({currentTarget: null, target: inside}), true, 'currentTarget is null after dispatch');
    assert.equal(isHudOrigin({currentTarget: outside, target: outside}), false);
    assert.equal(isHudOrigin(undefined), false);
    assert.equal(isHudOrigin({}), false);
});

test('midi\'s rest automation is recognised by its own call shape, a click never is', () => {
    assert.equal(isRestActivation({midiOptions: {noUseWarning: true}}), true);
    assert.equal(isRestActivation({midiOptions: {noUseWarning: true}, event: {}}), false);
    assert.equal(isRestActivation({midiOptions: {}}), false);
    assert.equal(isRestActivation({}), false);
    assert.equal(isRestActivation(undefined), false);
});

/* Queue T234 security review — a whisper list is never empty; the socket prompt validates both ends. */
import {whisperRecipients, restPromptAllowed} from './portentEffectSync.mjs';

test('rolled dice go to the player only; typed dice to the player and the GMs, de-duplicated', () => {
    assert.deepEqual(whisperRecipients({playerId: 'p', gmIds: ['g1', 'g2'], selfId: 'g1'}), ['p']);
    assert.deepEqual(whisperRecipients({playerId: 'p', gmIds: ['g1', 'g2'], selfId: 'p', byHand: true}), ['p', 'g1', 'g2']);
    assert.deepEqual(whisperRecipients({playerId: 'g1', gmIds: ['g1', 'g2'], selfId: 'g1', byHand: true}), ['g1', 'g2']);
});

test('no resolvable player never produces an empty (= public) whisper list', () => {
    assert.deepEqual(whisperRecipients({playerId: undefined, gmIds: ['g1'], selfId: 'me'}), ['me']);
    assert.deepEqual(whisperRecipients({playerId: undefined, gmIds: [], selfId: 'me', byHand: true}), ['me']);
    assert.deepEqual(whisperRecipients({playerId: undefined, gmIds: ['g1'], selfId: 'me', byHand: true}), ['g1']);
});

test('the rest prompt opens only for an owner, and only when a GM or an owner sent it', () => {
    assert.equal(restPromptAllowed({senderIsGM: true, senderOwns: true, receiverOwns: true}), true, 'GM rests the party');
    assert.equal(restPromptAllowed({senderIsGM: false, senderOwns: true, receiverOwns: true}), true, 'the player rests themselves');
    assert.equal(restPromptAllowed({senderIsGM: false, senderOwns: false, receiverOwns: true}), false, 'another player aims it at a GM or at the owner');
    assert.equal(restPromptAllowed({senderIsGM: true, senderOwns: true, receiverOwns: false}), false, 'aimed at a user who cannot see the actor');
    assert.equal(restPromptAllowed({}), false);
});

import {REST_PROMPT_SECONDS, countdownLabel} from './portentEffectSync.mjs';

test('the rest prompt expires after 40 seconds and its "later" button counts down', () => {
    assert.equal(REST_PROMPT_SECONDS, 40);
    assert.equal(countdownLabel("I'll roll them later", 40), "I'll roll them later (40)");
    assert.equal(countdownLabel('Li tiro più tardi', 0.2), 'Li tiro più tardi (1)');
    assert.equal(countdownLabel('x', -3), 'x (0)');
});


// T237 — the pre-roll prompt (dnd5e-declared-advantage) spends a die by VALUE, not by slot.
import { removePortentDie, portentDiceValues } from './portentEffectSync.mjs';

const T237_BLOCK = (values) => portentDiceBlock(values, { header: 'Your portent rolls are:<br><br>', label: (i) => `- Portent Roll ${i}:`, now: 1000 }) + '<p>Feature text.</p>';

test('T237 removePortentDie removes exactly one die with that value and keeps the rest', () => {
    const html = T237_BLOCK([7, 15]);
    const out = removePortentDie(html, 15);
    assert.equal(out.removed, true);
    assert.deepEqual(currentPortentDice(out.html), ['7']);
    assert.ok(out.html.includes('<p>Feature text.</p>'));
    assert.ok(out.html.includes('endPortentRolls'));
});

test('T237 removePortentDie with two equal dice removes only the first', () => {
    const out = removePortentDie(T237_BLOCK([9, 9, 3]), 9);
    assert.equal(out.removed, true);
    assert.deepEqual(currentPortentDice(out.html), ['9', '3']);
});

test('T237 removePortentDie leaves the text untouched when the value is not there', () => {
    const html = T237_BLOCK([7, 15]);
    const out = removePortentDie(html, 20);
    assert.equal(out.removed, false);
    assert.equal(out.html, html);
    assert.equal(removePortentDie(html, 1).removed, false, '1 must not match 15');
    assert.deepEqual(removePortentDie('', 7), { html: '', removed: false });
});

test('T237 portentDiceValues keeps only whole faces 1-20, in order', () => {
    assert.deepEqual(portentDiceValues(T237_BLOCK([7, 15])), [7, 15]);
    assert.deepEqual(portentDiceValues(T237_BLOCK(['20', 'N/A', 0, 21, '3'])), [20, 3]);
    assert.deepEqual(portentDiceValues(null), []);
});
