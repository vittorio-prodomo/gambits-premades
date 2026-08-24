/*
 * Queue T150 — does the attacker already carry attack disadvantage in their own midi flags?
 *
 * Protection's pre-roll gate reads `workflow.tracker.hasDisadvantage`, but Sap-shaped effects
 * deliver disadvantage through `flags.midi-qol.disadvantage.attack.*` ON THE ATTACKER, which the
 * tracker does not yet reflect when the reaction offer is raised. DAE folds effect changes into
 * the actor's evaluated flags at prepareData, so reading the actor is enough.
 *
 * ⚠️ Deliberately a truthiness read: some midi flags can hold condition EXPRESSIONS, which this
 * helper treats as set (a false-negative would re-open the noisy offer; a false-positive only
 * suppresses an offer the attacker likely shouldn't get anyway).
 *
 * Pure: takes an actor-shaped object; `keys` narrows which attack kinds are relevant
 * (Protection reacts to melee, so the default is all + mwak).
 */
export function attackerHasDisadvantageFlags(actor, keys = ['all', 'mwak']) {
    const attack = actor?.flags?.['midi-qol']?.disadvantage?.attack;
    if (!attack) return false;
    return keys.some(k => {
        const v = attack[k];
        return v !== undefined && v !== null && v !== '' && v !== '0' && v !== 0 && v !== false;
    });
}
