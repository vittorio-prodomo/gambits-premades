/*
 * Sleep 2024 — the stage-2 "save vs Unconscious" (upstream 2.1.44 model, adopted 2026-09-06).
 *
 * RAW: a creature that fails the first save is Incapacitated until the end of its next turn, at
 * which point it repeats the save; a second failure makes it Unconscious for the duration.
 *
 * Upstream's shape: the Incapacitated effect lasts the whole minute and carries DAE's
 * `macroRepeat: endEveryTurn`; times-up fires the item macro's `each` branch at the end of the
 * sleeper's turn, in combat only. That is a POSITIVE trigger — it replaces the old T130 gate,
 * which had to infer "was this the turn-end expiry?" from the deletion reason of a `turnEnd`
 * special duration because DAE ran the `off` macro on ANY removal (concentration teardown included).
 *
 * The effect is recognised by upstream's stable `flags.gambits-premades.gpsUuid`, not by name or
 * shape — the same id the pack ships, so a re-import or a Medkit refresh keeps the gate alive.
 *
 * Fork deviation from upstream (kept from T130's follow-up, Vittorio 2026-08-24): the Incapacitated
 * effect is DELETED after the second save EITHER WAY. Upstream only clears `macroRepeat` on a
 * failure, leaving Incapacitated beside Unconscious for the rest of the minute — mechanically
 * harmless (Unconscious includes it) but a second icon, a stale VAE button, and an effect that
 * outlives the `isDamaged` wake-up on Unconscious.
 */

/** The `gpsUuid` upstream stamps on Sleep's Incapacitated effect (packData, 2.1.44). */
export const SLEEP_INCAPACITATED_GPS_UUID = "12518587-9f13-41c9-aff9-a5bf885aed32";

/**
 * Is this effect Sleep's stage-1 Incapacitated? Sync and pure, so the VAE hook can use it.
 * @param {object|null|undefined} effect
 * @returns {boolean}
 */
export function isSleepIncapacitated(effect) {
    return effect?.flags?.["gambits-premades"]?.gpsUuid === SLEEP_INCAPACITATED_GPS_UUID;
}

/**
 * Find Sleep's Incapacitated effect on an actor.
 * @param {{appliedEffects?: Iterable<object>}|null|undefined} actor
 * @returns {object|undefined}
 */
export function findSleepIncapacitated(actor) {
    for (const effect of actor?.appliedEffects ?? []) {
        if (isSleepIncapacitated(effect)) return effect;
    }
    return undefined;
}

/**
 * What the second save decided. `gpsActivityUse` reports `{failedSaves: {size}}`; a missing or
 * malformed result is treated as "awake" — a broken roll must never put a creature to sleep.
 * @param {{failedSaves?: {size?: number}}|null|undefined} saveResult
 * @returns {"unconscious"|"awake"}
 */
export function stageTwoOutcome(saveResult) {
    return (saveResult?.failedSaves?.size ?? 0) > 0 ? "unconscious" : "awake";
}
