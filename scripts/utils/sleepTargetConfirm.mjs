/*
 * Queue T131 (+ 08-24 follow-up) — the pure halves of Sleep's "each creature of your choice"
 * confirmation.
 *
 * RAW 2024 Sleep targets creatures OF THE CASTER'S CHOICE inside the sphere. midi's template
 * auto-targeting sweeps in hostiles only (disposition filter), so the dialog lists BOTH:
 * auto-targeted creatures (ticked) and covered-but-not-targeted ones — allies — UNTICKED, so
 * including an ally is a conscious choice (Vittorio 2026-08-24).
 */
export function buildSleepConfirmRows(targets, extras = []) {
    const row = (t, checked, extra) => ({
        id: t.id,
        name: t.name ?? t.document?.name,
        img: t.document?.texture?.src,
        checked,
        extra
    });
    return [...[...targets].map(t => row(t, true, false)), ...[...extras].map(t => row(t, false, true))];
}

/*
 * Mutates `targets` (a Set of Token objects) in place — the workflow owns it and midi reads the
 * same reference downstream. Removes auto-targets whose ids are not kept, adds kept extras.
 * Returns {removed, added} so the caller can sync canvas targeting both ways.
 */
export function applyConfirmSelection(targets, keptIds, extras = []) {
    const kept = new Set(keptIds);
    const removed = [];
    for (const token of [...targets]) {
        if (!kept.has(token.id)) {
            targets.delete(token);
            removed.push(token);
        }
    }
    const added = [];
    for (const token of extras) {
        if (kept.has(token.id) && !targets.has(token)) {
            targets.add(token);
            added.push(token);
        }
    }
    return {removed, added};
}
