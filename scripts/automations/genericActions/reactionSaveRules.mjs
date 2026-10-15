const NO_REACTIONS = ['incapacitated', 'unconscious', 'paralyzed', 'stunned', 'petrified'];
export function canReact({reactionUsed, statuses}) {
    if (reactionUsed) return false;
    return !(statuses ?? []).some(s => NO_REACTIONS.includes(s));
}
export function promptRecipient({playerId, playerActive, gmId}) {
    if (playerId && playerActive) return playerId;
    return gmId ?? null;
}
/**
 * Ask each recipient in turn (duplicates and empties skipped); the first answer wins. A recipient whose call
 * throws — socketlib rejects on a mid-prompt disconnect or a stale page without the handler — is skipped.
 * Every recipient failing gives null: the caller treats it as "nobody could be asked", never as an error.
 */
export async function askInOrder(recipients, ask) {
    const seen = new Set();
    for (const id of recipients ?? []) {
        if (!id || seen.has(id)) continue;
        seen.add(id);
        try { return await ask(id); } catch { /* next recipient */ }
    }
    return null;
}
