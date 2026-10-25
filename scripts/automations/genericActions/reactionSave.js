import { askInOrder, promptRecipient, promptSeconds, reactionBlock } from './reactionSaveRules.mjs';
const I18N = 'GAMBITSPREMADES.Dialogs.Automations.GenericActions.ReactionSave';
const esc = s => foundry.utils.escapeHTML(String(s ?? ''));
const countdownLabel = (label, left) => `${label} (${Math.max(0, Math.ceil(left))})`;

// Runs on the client it is addressed to. Self-validating: the receiver must own the target.
export async function reactionSavePrompt({ targetTokenUuid, ability, dc, title, text, seconds } = {}) {
    seconds = promptSeconds(seconds);
    const tokenDoc = await fromUuid(targetTokenUuid);
    const actor = tokenDoc?.actor;
    if (!actor?.isOwner) return { accepted: false, total: null };
    const declineLabel = game.i18n.localize(`${I18N}.Decline`);
    const deadline = Date.now() + seconds * 1000;
    let ticker = null;
    const choice = await foundry.applications.api.DialogV2.wait({
        window: { title: `${esc(title)} — ${esc(actor.name)}` },
        position: { width: 420 },
        content: `<div class="gps-dialog-container"><div class="gps-dialog-section"><div class="gps-dialog-content">
            <p class="gps-dialog-paragraph">${esc(text)}</p></div></div></div>`,
        buttons: [
            { action: 'dodge', label: game.i18n.localize(`${I18N}.Accept`), icon: 'fa-solid fa-person-running', default: true },
            { action: 'decline', label: countdownLabel(declineLabel, seconds), icon: 'fa-solid fa-xmark' }
        ],
        render: (event, dialog) => {
            if (ticker) return;
            ticker = setInterval(() => {
                const left = (deadline - Date.now()) / 1000;
                if (left <= 0) { clearInterval(ticker); return dialog.close(); }
                const span = dialog.element?.querySelector('button[data-action="decline"] span');
                if (span) span.innerText = countdownLabel(declineLabel, left);
            }, 250);
        },
        close: () => clearInterval(ticker),
        rejectClose: false
    });
    clearInterval(ticker);
    if (choice !== 'dodge') return { accepted: false, total: null };
    const rolls = await actor.rollSavingThrow({ ability, target: dc });
    const roll = Array.isArray(rolls) ? rolls[0] : rolls;
    // The save dialog closed without a roll: no dodge, and the reaction stays unspent.
    if (!Number.isFinite(roll?.total)) return { accepted: false, total: null, unrolled: true };
    await MidiQOL.setReactionUsed(actor);
    return { accepted: true, total: roll.total };
}

// `reason` says why nothing was offered: 'used' (no reaction left), 'cannot' (a condition forbids reactions),
// 'nobody' (no one could answer for the creature), 'noActor'. An offer answered without a rolled save
// carries `unrolled: true` and counts as declined.
export async function offerReactionSave({ targetTokenUuid, ability = 'dex', dc, title, text, seconds } = {}) {
    const notOffered = reason => ({ offered: false, accepted: false, total: null, reason });
    const tokenDoc = await fromUuid(targetTokenUuid);
    const actor = tokenDoc?.actor;
    if (!actor) return notOffered('noActor');
    const block = reactionBlock({ reactionUsed: !!MidiQOL.hasUsedReaction(actor), statuses: [...actor.statuses] });
    if (block) return notOffered(block);
    const player = MidiQOL.playerForActor(actor);
    const gmId = game.users.activeGM?.id ?? null;
    const first = promptRecipient({ playerId: player?.id ?? null, playerActive: !!player?.active, gmId });
    if (!first) return notOffered('nobody');
    const data = { targetTokenUuid, ability, dc, title, text, seconds };
    // The player first, then the active GM: a recipient that cannot answer (disconnected mid-prompt, or a
    // stale page without the handler) is skipped instead of killing the caller's action (review #4).
    const result = await askInOrder([first, gmId], id => id === game.user.id
        ? reactionSavePrompt(data)
        : game.gps.socket.executeAsUser('reactionSavePrompt', id, data));
    if (result === null) return notOffered('nobody');
    return { offered: true, accepted: !!result?.accepted, total: result?.total ?? null, unrolled: !!result?.unrolled };
}
