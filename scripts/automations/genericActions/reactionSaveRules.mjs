const NO_REACTIONS = ['incapacitated', 'unconscious', 'paralyzed', 'stunned', 'petrified'];
const DEFAULT_SECONDS = 30;
/** Why a creature cannot take the reaction: 'used' (already spent), 'cannot' (a condition forbids it), or null. */
export function reactionBlock({reactionUsed, statuses}) {
    if (reactionUsed) return 'used';
    return (statuses ?? []).some(s => NO_REACTIONS.includes(s)) ? 'cannot' : null;
}
export function canReact(state) {
    return reactionBlock(state) === null;
}
/** The prompt's countdown: a positive number of seconds, else the default (a NaN deadline never closes). */
export function promptSeconds(seconds) {
    const value = Number(seconds);
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_SECONDS;
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
