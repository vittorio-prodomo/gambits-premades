/*
 * Queue T131 — the pure halves of Sleep's "each creature of your choice" confirmation.
 *
 * RAW 2024 Sleep targets creatures OF THE CASTER'S CHOICE inside the sphere; the template
 * auto-targeting swept in everything. The caster-facing dialog is built from these rows and the
 * resulting kept-ids selection is applied to the workflow's target Set before any save rolls.
 */
export function buildSleepConfirmRows(targets) {
    return [...targets].map(t => ({
        id: t.id,
        name: t.name ?? t.document?.name,
        img: t.document?.texture?.src
    }));
}

/*
 * Mutates `targets` (a Set of Token objects) in place — the workflow owns it and midi reads the
 * same reference downstream. Returns the removed tokens so the caller can release canvas targeting.
 */
export function applyConfirmSelection(targets, keptIds) {
    const kept = new Set(keptIds);
    const removed = [];
    for (const token of [...targets]) {
        if (!kept.has(token.id)) {
            targets.delete(token);
            removed.push(token);
        }
    }
    return removed;
}
