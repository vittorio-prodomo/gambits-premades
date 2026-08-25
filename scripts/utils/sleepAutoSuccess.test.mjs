import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/*
 * T174 — immune creatures never visibly roll a Sleep save.
 *
 * The T116/T133 model reclassified at postSave, AFTER a real roll: the die animated, a number
 * appeared, then the row was repainted. Vittorio's generalisation: auto-successes should skip the
 * roll entirely and print the AUTOSUCCESS row directly — the preTargetSave-succeed mechanism T126
 * built for PfEG (and T129 standardized) IS that: midi pins the outcome before any roll is queued,
 * so there is no die, no number, and the postSave repaint still paints the row.
 */
const sleepPath = fileURLToPath(new URL('../automations2024/spells/sleep2024.js', import.meta.url));
const modulePath = fileURLToPath(new URL('../module.js', import.meta.url));

test('T174: Sleep forces immune saves at preTargetSave, before any roll exists', () => {
    const source = readFileSync(sleepPath, 'utf8');
    assert.match(source, /registerSleepAutoSuccess/);
    assert.match(source, /midi-qol\.preTargetSave/);
    assert.match(source, /actorDoesNotSleep\(target\?\.actor\)/);
    assert.match(source, /modifiers\?\.succeed\(/);
    // Same item gate as the T131 confirmation hook — the wiring string, not a localized name.
    assert.match(source, /game\.gps\.sleep2024/);
});

test('T174: the forced success is published through advantageByChoice (the T126 contract)', () => {
    // ⚠️ midi queues only advantageByChoice trackers into a normal one-ability save — mutating the
    // default tracker alone updates the tooltip while the target still rolls and can still fail.
    const source = readFileSync(sleepPath, 'utf8');
    assert.match(source, /advantageByChoice/);
    assert.match(source, /rollAbilities\?\.length === 1/);
});

test('T174: the hook is registered at module init alongside the confirmation hook', () => {
    const source = readFileSync(modulePath, 'utf8');
    assert.match(source, /registerSleepAutoSuccess\(\)/);
});
