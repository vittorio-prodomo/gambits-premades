import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

// ⚠️ Queue T117. A `synthetic*` activity is re-invoked mid-automation (a repeat save, a follow-up
// check) via `gpsActivityUse` → `MidiQOL.completeActivityUse`. dnd5e's `Activity#requiresConcentration`
// is simply `this.duration.concentration`, and an ActivityDuration with `override: false` INHERITS the
// parent item's duration. So on a concentration item, a synthetic activity that does not override
// silently reports `concentration: true` — and `Activity#use` then does
// `beginConcentrating(new)` followed by `endConcentration(old)`, whose `_onDelete` deletes every
// dependent of the old concentration. Those dependents are the spell's applied effects on ALL its
// targets, so each re-save destroys the previous target's effects. Sleep shipped this way and left
// creatures holding nothing but the Prone rider (riders are not dependents, so they survive).
//
// The invariant below is pack-wide on purpose: it is cheap, and it pins the whole class rather than
// the one spell that happened to be reported.

const packRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'packData');

function packFiles(dir) {
    return readdirSync(dir).flatMap(entry => {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) return packFiles(full);
        return full.endsWith('.json') ? [full] : [];
    });
}

function itemRequiresConcentration(doc) {
    if (doc?.system?.duration?.concentration === true) return true;
    return Array.isArray(doc?.system?.properties) && doc.system.properties.includes('concentration');
}

function syntheticActivities(doc) {
    const activities = doc?.system?.activities;
    if (!activities || typeof activities !== 'object') return [];
    return Object.entries(activities)
        .map(([id, activity]) => ({ id, activity, identifier: activity?.midiProperties?.identifier ?? '' }))
        .filter(entry => entry.identifier.startsWith('synthetic'));
}

const docs = packFiles(packRoot).map(file => ({ file, doc: JSON.parse(readFileSync(file, 'utf8')) }));

test('the pack fixture set is non-empty and actually contains synthetic activities', () => {
    // Guards the guard: a path typo would otherwise make every assertion below vacuously pass.
    const total = docs.reduce((n, { doc }) => n + syntheticActivities(doc).length, 0);
    assert.ok(docs.length > 100, `expected to read the packs, found ${docs.length} documents`);
    assert.ok(total > 50, `expected many synthetic activities, found ${total}`);
});

test('no synthetic activity inherits concentration from its item', () => {
    const offenders = [];
    for (const { file, doc } of docs) {
        if (!itemRequiresConcentration(doc)) continue;
        for (const { identifier, activity } of syntheticActivities(doc)) {
            if (activity?.duration?.override !== true) {
                offenders.push(`${basename(file)} :: ${identifier} (duration.override=${activity?.duration?.override})`);
            }
        }
    }
    assert.deepEqual(offenders, [], 'a synthetic activity on a concentration item must set duration.override '
        + 'so it does not re-enter concentration and destroy the previous concentration\'s dependents');
});

test('no synthetic activity declares concentration outright', () => {
    const offenders = [];
    for (const { file, doc } of docs) {
        for (const { identifier, activity } of syntheticActivities(doc)) {
            if (activity?.duration?.concentration === true) offenders.push(`${basename(file)} :: ${identifier}`);
        }
    }
    assert.deepEqual(offenders, []);
});

// ⚠️ Queue T117, second defect. dnd5e builds the CONCENTRATION effect from the activity's duration
// (`ActiveEffect5e.createConcentrationEffectData` → `activity.duration.getEffectData()`), so an
// activity that overrides its duration is also setting how long the caster concentrates. Sleep
// overrode to 1 round on a 1-minute spell, so concentration expired at the next round boundary and
// took the sleeping creatures with it — its dependents are the applied effects on every target.
test('a concentrating activity does not shorten the concentration below the item duration', () => {
    const offenders = [];
    for (const { file, doc } of docs) {
        if (!itemRequiresConcentration(doc)) continue;
        const item = doc.system.duration ?? {};
        const activities = doc?.system?.activities ?? {};
        for (const [id, activity] of Object.entries(activities)) {
            const identifier = activity?.midiProperties?.identifier ?? '';
            if (identifier.startsWith('synthetic')) continue;      // covered by the tests above
            const duration = activity?.duration ?? {};
            if (duration.override !== true) continue;              // inherits the item's — correct
            const matches = (duration.units === item.units) && (String(duration.value) === String(item.value));
            if (!matches) {
                offenders.push(`${basename(file)} :: ${identifier || id} overrides to `
                    + `${duration.value} ${duration.units} but the item lasts ${item.value} ${item.units}`);
            }
        }
    }
    assert.deepEqual(offenders, [], 'an activity that begins concentration must not override the duration '
        + 'to something shorter than the spell — the concentration effect is built from it, and its expiry '
        + 'deletes every effect the spell applied');
});

test('Sleep\'s syntheticSave does not concentrate (T117 regression pin)', () => {
    // Named explicitly because this is the one that shipped broken: every end-of-turn re-save started
    // a fresh concentration on Sleep, ending the previous one and deleting the sleep effects it held.
    const entry = docs.find(({ file }) => basename(file).startsWith('Sleep_'));
    assert.ok(entry, 'Sleep pack entry not found');
    const synthetic = syntheticActivities(entry.doc).find(a => a.identifier === 'syntheticSave');
    assert.ok(synthetic, 'Sleep has no syntheticSave activity');
    assert.equal(synthetic.activity.duration.override, true);
    assert.equal(synthetic.activity.duration.concentration, false);
    assert.equal(synthetic.activity.duration.units, 'inst');
});
