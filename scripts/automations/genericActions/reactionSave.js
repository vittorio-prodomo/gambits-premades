import { canReact, promptRecipient } from './reactionSaveRules.mjs';
const I18N = 'GAMBITSPREMADES.Dialogs.Automations.GenericActions.ReactionSave';
const DEFAULT_SECONDS = 30;
const esc = s => foundry.utils.escapeHTML(String(s ?? ''));
const countdownLabel = (label, left) => `${label} (${Math.max(0, Math.ceil(left))})`;

// Runs on the client it is addressed to. Self-validating: the receiver must own the target.
export async function reactionSavePrompt({ targetTokenUuid, ability, dc, title, text, seconds = DEFAULT_SECONDS } = {}) {
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
    await MidiQOL.setReactionUsed(actor);
    const rolls = await actor.rollSavingThrow({ ability, target: dc });
    const roll = Array.isArray(rolls) ? rolls[0] : rolls;
    return { accepted: true, total: roll?.total ?? null };
}

export async function offerReactionSave({ targetTokenUuid, ability = 'dex', dc, title, text, seconds } = {}) {
    const tokenDoc = await fromUuid(targetTokenUuid);
    const actor = tokenDoc?.actor;
    if (!actor) return { offered: false, accepted: false, total: null };
    if (!canReact({ reactionUsed: !!MidiQOL.hasUsedReaction(actor), statuses: [...actor.statuses] })) return { offered: false, accepted: false, total: null };
    const player = MidiQOL.playerForActor(actor);
    const recipient = promptRecipient({ playerId: player?.id ?? null, playerActive: !!player?.active, gmId: game.users.activeGM?.id ?? null });
    if (!recipient) return { offered: false, accepted: false, total: null };
    const data = { targetTokenUuid, ability, dc, title, text, seconds };
    const result = recipient === game.user.id ? await reactionSavePrompt(data) : await game.gps.socket.executeAsUser('reactionSavePrompt', recipient, data);
    return { offered: true, accepted: !!result?.accepted, total: result?.total ?? null };
}
