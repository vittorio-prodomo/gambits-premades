import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSleepConfirmRows, applyConfirmSelection} from './sleepTargetConfirm.mjs';

/*
 * Queue T131 (+ the 08-24 follow-up): RAW 2024 Sleep is "Each creature of your choice in a
 * 5-foot-radius Sphere". The caster's confirmation dialog lists BOTH the auto-targeted creatures
 * (ticked) and the covered-but-not-auto-targeted ones — allies, which midi's disposition filter
 * excludes (Vittorio 2026-08-24: include them, but UNTICKED, so hitting an ally is a conscious
 * choice). Applying the selection can therefore both REMOVE unticked auto-targets and ADD ticked
 * extras.
 */

const fakeToken = (id, name, img) => ({
    id,
    name,
    document: {texture: {src: img}, name}
});

test('builds ticked rows for auto-targets and unticked rows for covered extras, in that order', () => {
    const rows = buildSleepConfirmRows(
        [fakeToken('a1', 'Goblin A', 'a.webp')],
        [fakeToken('w1', 'Warpey', 'w.webp')]
    );
    assert.deepEqual(rows, [
        {id: 'a1', name: 'Goblin A', img: 'a.webp', checked: true, extra: false},
        {id: 'w1', name: 'Warpey', img: 'w.webp', checked: false, extra: true}
    ]);
});

test('no extras still works (the original shape)', () => {
    const rows = buildSleepConfirmRows([fakeToken('a1', 'A', 'a.webp')]);
    assert.deepEqual(rows, [{id: 'a1', name: 'A', img: 'a.webp', checked: true, extra: false}]);
});

test('falls back to the document name when the token object has none', () => {
    const t = {id: 'c3', document: {texture: {src: 'x.webp'}, name: 'Doc Name'}};
    assert.equal(buildSleepConfirmRows([t])[0].name, 'Doc Name');
});

test('removes unticked auto-targets and adds ticked extras', () => {
    const a = fakeToken('a1', 'A'), b = fakeToken('b2', 'B'), w = fakeToken('w1', 'W');
    const targets = new Set([a, b]);
    const {removed, added} = applyConfirmSelection(targets, ['a1', 'w1'], [w]);
    assert.deepEqual([...targets], [a, w]);
    assert.deepEqual(removed.map(t => t.id), ['b2']);
    assert.deepEqual(added.map(t => t.id), ['w1']);
});

test('unticked extras stay out', () => {
    const a = fakeToken('a1', 'A'), w = fakeToken('w1', 'W');
    const targets = new Set([a]);
    const {removed, added} = applyConfirmSelection(targets, ['a1'], [w]);
    assert.deepEqual([...targets], [a]);
    assert.deepEqual(removed, []);
    assert.deepEqual(added, []);
});

test('keeping every auto-target and no extras removes and adds nothing', () => {
    const a = fakeToken('a1', 'A'), b = fakeToken('b2', 'B');
    const targets = new Set([a, b]);
    const {removed, added} = applyConfirmSelection(targets, ['a1', 'b2'], []);
    assert.equal(targets.size, 2);
    assert.deepEqual(removed, []);
    assert.deepEqual(added, []);
});

test('an empty kept list empties the set', () => {
    const a = fakeToken('a1', 'A');
    const targets = new Set([a]);
    const {removed} = applyConfirmSelection(targets, [], []);
    assert.equal(targets.size, 0);
    assert.deepEqual(removed.map(t => t.id), ['a1']);
});

test('an extra already in the target set is not double-added', () => {
    const a = fakeToken('a1', 'A');
    const targets = new Set([a]);
    const {added} = applyConfirmSelection(targets, ['a1'], [a]);
    assert.equal(targets.size, 1);
    assert.deepEqual(added, []);
});
