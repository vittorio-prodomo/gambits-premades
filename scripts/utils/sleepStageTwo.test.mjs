import test from 'node:test';
import assert from 'node:assert/strict';
import {
    SLEEP_INCAPACITATED_GPS_UUID,
    isSleepIncapacitated,
    findSleepIncapacitated,
    stageTwoOutcome
} from './sleepStageTwo.mjs';

/*
 * Sleep's stage-2 save now rides upstream's per-turn repeat (2.1.44): times-up fires the `each`
 * branch at the end of the sleeper's turn, and the effect is found by its stable gpsUuid rather
 * than by the old `turnEnd` special-duration shape.
 */

const sleepEffect = { id: 'inc', flags: { 'gambits-premades': { gpsUuid: SLEEP_INCAPACITATED_GPS_UUID } }, statuses: new Set(['incapacitated']) };
const otherIncapacitated = { id: 'other', flags: { dae: { specialDuration: ['turnEnd'] } }, statuses: new Set(['incapacitated']) };

test('isSleepIncapacitated keys on the gpsUuid, not the condition shape', () => {
    assert.equal(isSleepIncapacitated(sleepEffect), true);
    // The OLD gate's signature (incapacitated + turnEnd) is no longer enough — another spell's
    // Incapacitated must not get a Sleep button.
    assert.equal(isSleepIncapacitated(otherIncapacitated), false);
    assert.equal(isSleepIncapacitated(undefined), false);
    assert.equal(isSleepIncapacitated({}), false);
});

test('findSleepIncapacitated returns the Sleep effect among an actor\'s applied effects', () => {
    const actor = { appliedEffects: [otherIncapacitated, sleepEffect] };
    assert.equal(findSleepIncapacitated(actor), sleepEffect);
    assert.equal(findSleepIncapacitated({ appliedEffects: [otherIncapacitated] }), undefined);
    assert.equal(findSleepIncapacitated(undefined), undefined);
});

test('stageTwoOutcome: a failed second save means Unconscious', () => {
    assert.equal(stageTwoOutcome({ failedSaves: { size: 1 } }), 'unconscious');
});

test('stageTwoOutcome: a passed second save means awake', () => {
    assert.equal(stageTwoOutcome({ failedSaves: { size: 0 } }), 'awake');
});

test('stageTwoOutcome fails safe: a missing or malformed result never puts a creature to sleep', () => {
    assert.equal(stageTwoOutcome(undefined), 'awake');
    assert.equal(stageTwoOutcome({}), 'awake');
    assert.equal(stageTwoOutcome({ failedSaves: {} }), 'awake');
});
