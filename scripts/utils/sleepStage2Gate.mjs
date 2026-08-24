/*
 * Queue T130 — the gate for Sleep's stage-2 "save vs Unconscious".
 *
 * DAE runs the Incapacitated effect's `off` macro on ANY removal, with the deletion's
 * `expiry-reason` forwarded in the macro's lastArg. The only removal that RAW-legitimately
 * triggers the repeat save is times-up expiring the `turnEnd` special duration at the end of the
 * sleeper's turn — everything else (concentration teardown when the spell ends, a manual removal,
 * a Medkit pass; DAE defaults these to 'effect-deleted') must stay silent.
 *
 * Outside combat the stage-2 save never auto-fires (Vittorio 2026-08-24) — the VAE button on the
 * effect is the manual trigger for out-of-combat play.
 *
 * Pure: all three facts are resolved by the caller.
 */
export function shouldFireSleepStage2({expiryReason, combatStarted, concentrationAlive}) {
    if (expiryReason !== 'times-up:turnEnd') return false;
    if (!combatStarted) return false;
    if (!concentrationAlive) return false;
    return true;
}
