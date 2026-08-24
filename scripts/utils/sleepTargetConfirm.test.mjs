import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSleepConfirmRows, applyConfirmSelection} from './sleepTargetConfirm.mjs';

/*
 * Queue T131: RAW 2024 Sleep is "Each creature of your choice in a 5-foot-radius Sphere", but the
 * template auto-targeting swept in every covered creature. The caster now gets a confirmation
 * dialog listing the covered creatures with untick boxes; unticked ones are dropped from the
 * workflow's target set before any save rolls. These are the pure halves: row building from
 * tokens, and applying the kept-id selection to a Set of tokens.
 */

const fakeToken = (id, name, img) => ({
    id,
    name,
    document: {texture: {src: img}, name}
});

test('builds one row per target with id, name and image', () => {
    const rows = buildSleepConfirmRows([
        fakeToken('a1', 'Goblin A', 'goblin-a.webp'),
        fakeToken('b2', 'Goblin B', 'goblin-b.webp')
    ]);
    assert.deepEqual(rows, [
        {id: 'a1', name: 'Goblin A', img: 'goblin-a.webp'},
        {id: 'b2', name: 'Goblin B', img: 'goblin-b.webp'}
    ]);
});

test('falls back to the document name when the token object has none', () => {
    const t = {id: 'c3', document: {texture: {src: 'x.webp'}, name: 'Doc Name'}};
    assert.equal(buildSleepConfirmRows([t])[0].name, 'Doc Name');
});

test('applyConfirmSelection removes only the unticked tokens from the set', () => {
    const a = fakeToken('a1', 'A'), b = fakeToken('b2', 'B'), c = fakeToken('c3', 'C');
    const targets = new Set([a, b, c]);
    const removed = applyConfirmSelection(targets, ['a1', 'c3']);
    assert.deepEqual([...targets], [a, c]);
    assert.deepEqual(removed.map(t => t.id), ['b2']);
});

test('keeping every id removes nothing', () => {
    const a = fakeToken('a1', 'A'), b = fakeToken('b2', 'B');
    const targets = new Set([a, b]);
    const removed = applyConfirmSelection(targets, ['a1', 'b2']);
    assert.equal(targets.size, 2);
    assert.deepEqual(removed, []);
});

test('an empty kept list empties the set (caster deselected everyone)', () => {
    const a = fakeToken('a1', 'A');
    const targets = new Set([a]);
    const removed = applyConfirmSelection(targets, []);
    assert.equal(targets.size, 0);
    assert.deepEqual(removed.map(t => t.id), ['a1']);
});
