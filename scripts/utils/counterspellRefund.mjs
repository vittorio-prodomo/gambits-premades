// ⚠️ FORK PATCH: the 2024 Counterspell refunds the countered caster's spell slot ("the slot isn't expended").
// dnd5e 5.x records what a use spent on the chat card as `system.deltas` ({keyPath, delta}, delta negative for a
// spend) — the old `flags.dnd5e.use.consumed` GPS read is gone, so the refund was a silent no-op. Pure: no Foundry.

/**
 * @param {{actor?: {keyPath: string, delta: number}[]}|null} deltas  The usage card's system.deltas.
 * @param {(keyPath: string) => number} current  Reads the caster's current value at a key path.
 * @returns {{updates: Record<string, number>, remaining: {keyPath: string, delta: number}[]}}
 */
export function spellSlotRefund(deltas, current) {
    const updates = {};
    const remaining = [];
    for (const entry of deltas?.actor ?? []) {
        if (entry.keyPath?.startsWith('system.spells.')) updates[entry.keyPath] = (current(entry.keyPath) ?? 0) - entry.delta;
        else remaining.push(entry);
    }
    return {updates, remaining};
}
