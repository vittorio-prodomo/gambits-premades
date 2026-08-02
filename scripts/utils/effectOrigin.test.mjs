import test from 'node:test';
import assert from 'node:assert/strict';
import { itemUuidFromOrigin } from './effectOrigin.mjs';

test('passes an item origin through unchanged', () => {
    assert.equal(itemUuidFromOrigin('Actor.abc.Item.def'), 'Actor.abc.Item.def');
});

test('trims an activity origin back to its item, since an effect may be stamped with either', () => {
    assert.equal(itemUuidFromOrigin('Actor.abc.Item.def.Activity.ghi'), 'Actor.abc.Item.def');
});

test('handles a token-scoped actor origin, which carries two extra segments', () => {
    assert.equal(
        itemUuidFromOrigin('Scene.s1.Token.t1.Actor.a1.Item.i1.Activity.x1'),
        'Scene.s1.Token.t1.Actor.a1.Item.i1'
    );
});

test('handles a compendium origin', () => {
    assert.equal(itemUuidFromOrigin('Compendium.gambits-premades.gps-spells-2024.Item.abc'), 'Compendium.gambits-premades.gps-spells-2024.Item.abc');
});

test('returns null for a missing origin rather than throwing at the click site', () => {
    assert.equal(itemUuidFromOrigin(undefined), null);
    assert.equal(itemUuidFromOrigin(null), null);
    assert.equal(itemUuidFromOrigin(''), null);
});

test('returns null when the origin names no item at all, e.g. a bare actor', () => {
    assert.equal(itemUuidFromOrigin('Actor.abc'), null);
});
