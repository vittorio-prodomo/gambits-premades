import { test } from 'node:test';
import assert from 'node:assert/strict';
import { askInOrder, canReact, promptRecipient, promptSeconds, reactionBlock } from './reactionSaveRules.mjs';

test('no reaction left, or a condition that forbids reactions, means no prompt', () => {
    assert.equal(canReact({reactionUsed: false, statuses: []}), true);
    assert.equal(canReact({reactionUsed: true, statuses: []}), false);
    for (let s of ['incapacitated', 'unconscious', 'paralyzed', 'stunned', 'petrified']) assert.equal(canReact({reactionUsed: false, statuses: [s]}), false, s);
    assert.equal(canReact({reactionUsed: false, statuses: ['prone', 'restrained']}), true);
});

test('the prompt goes to the connected player, else the active GM', () => {
    assert.equal(promptRecipient({playerId: 'p1', playerActive: true, gmId: 'g1'}), 'p1');
    assert.equal(promptRecipient({playerId: 'p1', playerActive: false, gmId: 'g1'}), 'g1');
    assert.equal(promptRecipient({playerId: null, playerActive: false, gmId: 'g1'}), 'g1');
    assert.equal(promptRecipient({playerId: null, playerActive: false, gmId: null}), null);
});

// Review #4: socketlib REJECTS when the recipient disconnects mid-prompt or runs a stale page without the
// handler — the prompt must fall back to the next recipient, and give up quietly (no throw) when none answers.
test('askInOrder tries each recipient in turn and returns the first answer', async () => {
    let asked = [];
    let ask = async id => { asked.push(id); if (id === 'p1') throw new Error('disconnected'); return {accepted: true, total: 17}; };
    assert.deepEqual(await askInOrder(['p1', 'g1'], ask), {accepted: true, total: 17});
    assert.deepEqual(asked, ['p1', 'g1']);
});

test('askInOrder gives up with null when every recipient fails, and skips duplicates/empties', async () => {
    let asked = [];
    let ask = async id => { asked.push(id); throw new Error('no handler'); };
    assert.equal(await askInOrder(['g1', null, 'g1'], ask), null);
    assert.deepEqual(asked, ['g1']);
});

// T249 minors (2026-10-25): the caller words its card by WHY nothing was offered.
test('reactionBlock tells a spent reaction from a condition that forbids one', () => {
    assert.equal(reactionBlock({reactionUsed: false, statuses: ['prone']}), null);
    assert.equal(reactionBlock({reactionUsed: true, statuses: []}), 'used');
    assert.equal(reactionBlock({reactionUsed: false, statuses: ['stunned']}), 'cannot');
    assert.equal(reactionBlock({reactionUsed: true, statuses: ['stunned']}), 'used');
});

test('promptSeconds: a positive number, else the 30 s default', () => {
    assert.equal(promptSeconds(12), 12);
    assert.equal(promptSeconds('20'), 20);
    for (const bad of [undefined, null, 0, -5, NaN, 'soon', Infinity]) assert.equal(promptSeconds(bad), 30, String(bad));
});
