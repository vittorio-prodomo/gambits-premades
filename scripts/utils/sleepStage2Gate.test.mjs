import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldFireSleepStage2} from './sleepStage2Gate.mjs';

/*
 * Queue T130: DAE fires the Incapacitated effect's `off` macro on ANY removal, and the old off
 * branch fired the stage-2 "save vs Unconscious" unconditionally — so ending the caster's
 * concentration (or a manual removal, or a Medkit pass) put creatures to sleep AFTER the spell had
 * ended. The gate keys on the deletion's `expiry-reason`: only times-up's end-of-turn special
 * duration expiry is the RAW trigger, and only while the spell is still concentrated on, in combat.
 */

test('fires on the real end-of-turn expiry with concentration live in combat', () => {
    assert.equal(shouldFireSleepStage2({
        expiryReason: 'times-up:turnEnd',
        combatStarted: true,
        concentrationAlive: true
    }), true);
});

test('does NOT fire when the effect died with the concentration teardown', () => {
    // dnd5e dependent-deletion carries no times-up reason; DAE defaults it to 'effect-deleted'
    assert.equal(shouldFireSleepStage2({
        expiryReason: 'effect-deleted',
        combatStarted: true,
        concentrationAlive: false
    }), false);
});

test('does NOT fire on a manual removal even mid-combat with concentration live', () => {
    assert.equal(shouldFireSleepStage2({
        expiryReason: 'effect-deleted',
        combatStarted: true,
        concentrationAlive: true
    }), false);
});

test('does NOT fire when the deletion carries no reason at all', () => {
    assert.equal(shouldFireSleepStage2({
        expiryReason: undefined,
        combatStarted: true,
        concentrationAlive: true
    }), false);
});

test('does NOT fire outside combat regardless of reason (Vittorio 2026-08-24: manual only)', () => {
    assert.equal(shouldFireSleepStage2({
        expiryReason: 'times-up:turnEnd',
        combatStarted: false,
        concentrationAlive: true
    }), false);
});

test('does NOT fire when the concentration is already gone', () => {
    assert.equal(shouldFireSleepStage2({
        expiryReason: 'times-up:turnEnd',
        combatStarted: true,
        concentrationAlive: false
    }), false);
});

test('a plain duration expiry (times-up:expired) is not the repeat-save trigger', () => {
    assert.equal(shouldFireSleepStage2({
        expiryReason: 'times-up:expired',
        combatStarted: true,
        concentrationAlive: true
    }), false);
});
