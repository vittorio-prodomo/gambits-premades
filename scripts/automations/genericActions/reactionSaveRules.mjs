const NO_REACTIONS = ['incapacitated', 'unconscious', 'paralyzed', 'stunned', 'petrified'];
export function canReact({reactionUsed, statuses}) {
    if (reactionUsed) return false;
    return !(statuses ?? []).some(s => NO_REACTIONS.includes(s));
}
export function promptRecipient({playerId, playerActive, gmId}) {
    if (playerId && playerActive) return playerId;
    return gmId ?? null;
}
