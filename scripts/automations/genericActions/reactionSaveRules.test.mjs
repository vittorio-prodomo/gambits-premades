import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canReact, promptRecipient } from './reactionSaveRules.mjs';

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
