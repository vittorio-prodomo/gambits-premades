import {currentPortentDice, portentEffectPatch, isPortentEffectName, portentFeatureText, stripPortentDice, isFreshRefresh, activityIdentifier, PORTENT_REFRESH_IDENTIFIER, PORTENT_SET_IDENTIFIER, PORTENT_SYNTHETIC_IDENTIFIER, isSpendIdentifier, portentDiceBlock, parsePortentInput, isHudOrigin, isRestActivation, whisperRecipients, restPromptAllowed} from './portentEffectSync.mjs';

const I18N_CHAT = "GAMBITSPREMADES.ChatMessages.Automations.ClassFeatures.Wizard.SchoolOfDivination.Portent";
const I18N_DIALOG = "GAMBITSPREMADES.Dialogs.Automations.ClassFeatures.Wizard.SchoolOfDivination.Portent";

// The premade as CPR swaps it in — the T234 menu, guard and prompts apply to this item only.
function isGpsPortent(item) {
    return item?.name === "Portent" && item.flags?.["chris-premades"]?.info?.source === "gambits-premades";
}

function gpsPortentItem(actor) {
    return actor?.items?.find(i => isGpsPortent(i));
}

// Item images, names and the dice text stored in the description are all player-editable, and
// `i18n.format` does not escape — everything interpolated into dialog or chat markup goes through this.
const esc = (value) => foundry.utils.escapeHTML(String(value ?? ""));

function warnNoDice() {
    ui.notifications.warn(game.i18n.localize(`${I18N_CHAT}.NoDice`));
}

// ⚠️ FORK PATCH (queue T155): keep the Portent buff's title/tooltip in sync with the dice
// actually available — "Portent (7, 15)" while dice remain, back to "Portent" when spent out.
// Runs after every refresh and after every spend; a DDB re-import resets the effect to its
// bare name until the next long rest, which is acceptable (the sync is self-healing).
async function syncPortentEffect(actor, item, descriptionHtml) {
    const effect = Array.from(actor.allApplicableEffects()).find(e => isPortentEffectName(e.name, item.name));
    if (!effect) return;
    const dice = currentPortentDice(descriptionHtml);
    const i18nBase = "GAMBITSPREMADES.ChatMessages.Automations.ClassFeatures.Wizard.SchoolOfDivination.Portent";
    const patch = portentEffectPatch(item.name, dice, {
        // Table pass 2026-08-26: count-prefixed so "dice: 2" can't read as "2 dice".
        activeText: dice.length === 1
            ? game.i18n.format(`${i18nBase}.EffectActiveOne`, { dice: dice[0] })
            : game.i18n.format(`${i18nBase}.EffectActive`, { count: dice.length, dice: dice.join(", ") }),
        emptyText: game.i18n.localize(`${i18nBase}.EffectEmpty`),
    });
    await effect.update(patch);
}

export async function portent({ speaker, actor, token, character, item, args, scope, workflow, options }) {
    if(args?.[0].macroPass === "preActiveEffects") {
        // FORK PATCH (queue T217): the long-rest refresh is a native `longRest` activity on the item
        // (auto-used by midi's Activation Cost Automation, a card button in `chat`, manual from the
        // sheet in `none`). The item-level onUse macro fires for EVERY activity, so branch by identifier.
        if (activityIdentifier(workflow?.activity) === PORTENT_REFRESH_IDENTIFIER) {
            await refreshPortentDice({ actor, token, item });
            return;
        }
        let description = item.system.description.value;

        function extractPortentRolls(description) {
            let parser = new DOMParser();
            let doc = parser.parseFromString(description, 'text/html');
            let portentRollDivs = [];
            doc.querySelectorAll("[id^='Portent Roll']").forEach(div => {
                portentRollDivs.push(div);
            });
            return portentRollDivs;
        }

        let portentRollDivs = extractPortentRolls(description);
        // FORK PATCH (queue T234): the use is normally stopped before it starts (`dnd5e.preUseActivity`
        // below); this is the backstop for anything that reaches the pass another way.
        if(!portentRollDivs || portentRollDivs.length === 0) {
            warnNoDice();
            return workflow.aborted = true;
        }

        function generatePortentRollButtons() {
            let buttons = [];
            portentRollDivs.forEach((divContent, index) => {
                let parser = new DOMParser();
                let doc = parser.parseFromString(divContent.innerHTML, 'text/html');
                let span = doc.querySelector("[id^='portentRoll']");
                let roll = span ? span.innerText : "N/A";

                buttons.push({
                action: `${divContent.id} | ${roll}`,
                // Table pass 2026-08-26: the button reads just the roll value.
                label: `${roll}`,
                callback: async (html) => {
                    const divId = `${divContent.id}`;
                    const regex = new RegExp(`<div id="${divId}">[\\s\\S]*?<\\/div>`, 'g');

                    let newDescription = description.replace(regex, '');

                    await actor.updateEmbeddedDocuments("Item", [{
                    _id: item.id,
                    system: {
                        description: {
                        value: newDescription
                        }
                    }
                    }]);
                    
                    // FORK PATCH (queue T155): the spend just removed a die from the
                    // description — re-sync the buff title/tooltip to what remains.
                    await syncPortentEffect(actor, item, newDescription);

                    const chatMessage = MidiQOL.getCachedChatMessage(workflow.itemCardUuid);
                    let content = foundry.utils.duplicate(chatMessage.content);
                    let searchString = /<div class="midi-qol-attack-roll">[\s\S]*<div class="end-midi-qol-attack-roll">/g;
                    let replaceString = `<div class="midi-qol-attack-roll"><span style='text-wrap: wrap;'>${game.i18n.format("GAMBITSPREMADES.ChatMessages.Automations.ClassFeatures.Wizard.SchoolOfDivination.Portent.PortentApplied", { portentLabel: esc(divContent.id), roll: esc(roll) })}</span><div class="end-midi-qol-attack-roll">`;
                    content = content.replace(searchString, replaceString);
                    await chatMessage.update({ content: content });
                }
                });
            });
            return buttons;
        }

        await foundry.applications.api.DialogV2.wait({
            window: { title: game.i18n.localize("GAMBITSPREMADES.Dialogs.Automations.ClassFeatures.Wizard.SchoolOfDivination.Portent.Windowtitle") },
            content: `
                <div class="gps-dialog-container">
                    <div class="gps-dialog-section">
                        <div class="gps-dialog-content">
                            <div>
                                <div class="gps-dialog-flex">
                                    <p class="gps-dialog-paragraph">${game.i18n.localize("GAMBITSPREMADES.Dialogs.Automations.ClassFeatures.Wizard.SchoolOfDivination.Portent.SelectPortentRoll")}</p>
                                    <div id="image-container" class="gps-dialog-image-container">
                                        <img src="${esc(item.img)}" class="gps-dialog-image">
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `,
            buttons: generatePortentRollButtons(),
            close: async (event, dialog) => {
                return;
            }, rejectClose:false
        });
    }

    else if(args?.[0] === "off") {
        // Legacy edge (the old DAE `longRest` expiry, the manual world macro) — same routine.
        await refreshPortentDice({ actor, token, item });
    }
}
// FORK PATCH (queue T217): the refresh routine, shared by the native activity and the legacy edge.
async function refreshPortentDice({ actor, token, item }) {
    let tok = token ?? actor.getActiveTokens()[0];
    if (!tok) return ui.notifications.warn(`${item.name}: ${actor.name} has no token on the active scene.`);
    let diceNum = actor.classes.wizard.system.levels >= 14 ? 3 : 2;
    let values = [];

    for (let i = 1; i <= diceNum; i++) {
        let roll = await game.gps.gpsActivityUse({itemUuid: item.uuid, identifier: PORTENT_SYNTHETIC_IDENTIFIER, targetUuid: tok.document.uuid});
        values.push(roll?.utilityRolls?.total);
    }

    await writePortentDice({ actor, item, values });
}

// FORK PATCH (queue T234): one writer for rolled dice and for dice typed in by hand. Rolled dice are
// whispered to the player as before; typed ones go to the player AND the GMs, marked as entered by
// hand — nothing was rolled on screen, so the GM sees what was set.
async function writePortentDice({ actor, item, values, byHand = false }) {
    // The marker is stamped so the rest-time wipe can tell this refresh from yesterday's dice.
    let diceResult = portentDiceBlock(values, {
        header: "Your portent rolls are:<br><br>",
        label: (i) => game.i18n.format(`${I18N_CHAT}.PortentRoll`, { i: i }),
        now: Date.now()
    });

    let actorPlayer = MidiQOL.playerForActor(actor);
    let content = diceResult;
    if (byHand) content += `<p><em>${game.i18n.localize(`${I18N_CHAT}.EnteredByHand`)}</em></p>`;
    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: content,
        // Never an empty list — that would be a public message (see `whisperRecipients`).
        whisper: whisperRecipients({
            playerId: actorPlayer?.id,
            gmIds: game.users.filter(u => u.isGM).map(u => u.id),
            selfId: game.user.id,
            byHand
        })
    });

    let newDescription = diceResult + portentFeatureText(item.system.description.value);

    await actor.updateEmbeddedDocuments("Item", [{
        _id: item.id,
        system: {
            description: {
                value: newDescription
            }
        }
    }]);

    // FORK PATCH (queue T155): the lookup must also match a previously-suffixed name
    // ("Portent (7, 15)"), else the refresh crashes after our own rename.
    let effectData = Array.from(actor.allApplicableEffects()).find(e => isPortentEffectName(e.name, item.name));
    await effectData?.update({"disabled": false});
    await syncPortentEffect(actor, item, newDescription);
}

// FORK PATCH (queue T234): the Argon button opens this instead of going straight to "which die?" —
// spend a die, roll a new set, or type the dice in. The sheet's activity rows stay direct.
export async function portentMenu({ actor, item }) {
    const dice = currentPortentDice(item.system.description.value);
    const status = dice.length
        ? game.i18n.format(`${I18N_DIALOG}.MenuDice`, { dice: esc(dice.join(", ")) })
        : game.i18n.localize(`${I18N_DIALOG}.MenuNoDice`);

    const choice = await foundry.applications.api.DialogV2.wait({
        window: { title: item.name },
        position: { width: 520 },
        content: `
            <div class="gps-dialog-container">
                <div class="gps-dialog-section">
                    <div class="gps-dialog-content">
                        <div>
                            <div class="gps-dialog-flex">
                                <p class="gps-dialog-paragraph">${status}<br><br>${game.i18n.localize(`${I18N_DIALOG}.MenuPrompt`)}</p>
                                <div id="image-container" class="gps-dialog-image-container">
                                    <img src="${esc(item.img)}" class="gps-dialog-image">
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `,
        buttons: [
            { action: "spend", label: game.i18n.localize(`${I18N_DIALOG}.MenuSpend`), icon: "fa-solid fa-dice-d20", disabled: !dice.length, default: !!dice.length },
            { action: "refresh", label: game.i18n.localize(`${I18N_DIALOG}.MenuRefresh`), icon: "fa-solid fa-rotate", default: !dice.length },
            { action: "set", label: game.i18n.localize(`${I18N_DIALOG}.MenuSet`), icon: "fa-solid fa-pen" }
        ],
        rejectClose: false
    });

    if (choice === "spend") {
        // No event on this use, so it is not HUD-origin and runs the ordinary spend (guard included).
        const spend = item.system.activities.find(a => isSpendIdentifier(activityIdentifier(a)) && !a.midiProperties?.automationOnly);
        await spend?.use({}, {}, {});
    }
    else if (choice === "refresh") await refreshPortentDice({ actor, item });
    else if (choice === "set") await setPortentDiceByHand({ actor, item });
}

// FORK PATCH (queue T234): the player rolled physical dice — one field per die, pre-filled with the
// current ones. An empty field means that die does not exist.
export async function setPortentDiceByHand({ actor, item }) {
    const count = actor.classes?.wizard?.system?.levels >= 14 ? 3 : 2;
    let entered = currentPortentDice(item.system.description.value).slice(0, count);

    while (true) {
        let fields = "";
        for (let i = 1; i <= count; i++) {
            const value = foundry.utils.escapeHTML(String(entered[i - 1] ?? ""));
            fields += `<div class="form-group"><label>${game.i18n.format(`${I18N_DIALOG}.SetDie`, { i: i })}</label><div class="form-fields"><input type="number" name="die${i}" min="1" max="20" step="1" value="${value}"${i === 1 ? " autofocus" : ""}></div></div>`;
        }

        const raw = await foundry.applications.api.DialogV2.wait({
            window: { title: game.i18n.localize(`${I18N_DIALOG}.SetTitle`) },
            position: { width: 420 },
            content: `<p>${game.i18n.localize(`${I18N_DIALOG}.SetPrompt`)}</p>${fields}`,
            buttons: [
                {
                    action: "confirm", label: game.i18n.localize(`${I18N_DIALOG}.SetConfirm`), icon: "fa-solid fa-check", default: true,
                    callback: (event, button) => Array.from({ length: count }, (_, i) => button.form.elements[`die${i + 1}`]?.value ?? "")
                },
                { action: "cancel", label: game.i18n.localize(`${I18N_DIALOG}.SetCancel`), icon: "fa-solid fa-xmark" }
            ],
            rejectClose: false
        });
        if (!Array.isArray(raw)) return;

        const { values, error } = parsePortentInput(raw);
        if (!error) return await writePortentDice({ actor, item, values, byHand: true });

        ui.notifications.warn(game.i18n.localize(`${I18N_DIALOG}.${error === "empty" ? "SetEmpty" : "SetInvalid"}`));
        entered = raw;
    }
}

// FORK PATCH (queue T234): after a long rest the dice are no longer rolled unasked — the player is
// asked. Runs on the client it is addressed to (registered on the GPS socket as `portentRestPrompt`).
// "Later" needs nothing more: the rest-time wipe below has already removed yesterday's dice, and the
// menu (or the sheet rows) rolls or sets them whenever the player is ready.
export async function portentRestPrompt({ actorUuid } = {}) {
    const actor = typeof actorUuid === "string" ? await fromUuid(actorUuid) : null;
    if (!(actor instanceof Actor)) return;
    // Self-validating: socketlib calls this with `this.socketdata.userId` = the SENDER, and any
    // connected user can send it at anyone for any actor. A direct local call has no `this`.
    const sender = game.users.get(this?.socketdata?.userId) ?? game.user;
    if (!restPromptAllowed({
        senderIsGM: sender.isGM,
        senderOwns: actor.testUserPermission(sender, "OWNER"),
        receiverOwns: actor.isOwner
    })) return console.warn(`gambits-premades | Portent rest prompt refused (sender ${sender.name})`);
    const item = gpsPortentItem(actor);
    if (!item) return;

    const choice = await foundry.applications.api.DialogV2.wait({
        window: { title: `${item.name} — ${actor.name}` }, // set as text by ApplicationV2
        position: { width: 420 },
        content: `
            <div class="gps-dialog-container">
                <div class="gps-dialog-section">
                    <div class="gps-dialog-content">
                        <div>
                            <div class="gps-dialog-flex">
                                <p class="gps-dialog-paragraph">${game.i18n.localize(`${I18N_DIALOG}.RestPrompt`)}</p>
                                <div id="image-container" class="gps-dialog-image-container">
                                    <img src="${esc(item.img)}" class="gps-dialog-image">
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `,
        buttons: [
            { action: "yes", label: game.i18n.localize(`${I18N_DIALOG}.RestYes`), icon: "fa-solid fa-dice-d20", default: true },
            { action: "later", label: game.i18n.localize(`${I18N_DIALOG}.RestLater`), icon: "fa-solid fa-clock" }
        ],
        rejectClose: false
    });

    if (choice === "yes") await refreshPortentDice({ actor, item: gpsPortentItem(actor) ?? item });
}

// The prompt belongs to the character's player; whoever performed the rest (a GM resting the party)
// only keeps it when that player is not connected.
function offerRestRefresh(actor) {
    const player = MidiQOL.playerForActor(actor);
    const data = { actorUuid: actor.uuid };
    if (player?.active && player.id !== game.user.id) return game.gps.socket.executeAsUser("portentRestPrompt", player.id, data);
    return portentRestPrompt(data);
}

// FORK PATCH (queue T217): neither the refresh activity nor the two synthetic d20 uses it drives should
// post an item card — each one printed the feature text WITH the current dice to the whole table (the
// old DAE path leaked the two synthetic cards too; verified standalone). The dice reach the player
// through the whispered "Your portent rolls are" message only. midi's workflow runs fine without the
// card for a utility with no roll (verified live: manual refresh, three uses suppressed, no errors).
Hooks.on("dnd5e.preUseActivity", (activity, usageConfig, dialogConfig, messageConfig) => {
    if (activity?.item?.name !== "Portent") return;
    const id = activityIdentifier(activity);

    if (id === PORTENT_SYNTHETIC_IDENTIFIER) {
        if (messageConfig) messageConfig.create = false;
        return;
    }

    // FORK PATCH (queue T234). midi hands its rest automation a CLONE of the activity — work on the
    // actor's own item. Every branch that opens a dialog cancels this use (`return false`) and
    // carries on by itself: the hook is synchronous, and a use cancelled here leaves no card, no
    // workflow and no action-economy marker behind.
    const actor = activity.actor;
    const item = actor?.items?.get(activity.item.id);
    const fail = (err) => console.error("gambits-premades | Portent", err);

    if (id === PORTENT_REFRESH_IDENTIFIER) {
        if (isGpsPortent(item) && isRestActivation(usageConfig)) {
            Promise.resolve().then(() => offerRestRefresh(actor)).catch(fail);
            return false;
        }
        if (messageConfig) messageConfig.create = false;
        return;
    }

    if (!isGpsPortent(item)) return;

    if (id === PORTENT_SET_IDENTIFIER) {
        setPortentDiceByHand({ actor, item }).catch(fail);
        return false;
    }

    // The spend activity.
    if (isHudOrigin(usageConfig?.event)) {
        portentMenu({ actor, item }).catch(fail);
        return false;
    }
    if (!currentPortentDice(item.system.description.value).length) {
        warnNoDice();
        return false;
    }
});

// FORK PATCH (queue T217 follow-up): with no item card, the synthetic d20 reaches Dice So Nice with no
// message and bare options, so dsn-roller-labels can only say "GM". Stamp the roller's speaker and the
// roll kind on the roll's midi-qol options channel — the same vehicle midi's own patches use — BEFORE
// midi displays it (`dnd5e.rollFormulaV2` fires inside dnd5e's rollFormula, ahead of midi's
// displayDSNForRoll). Pill: "Nahuel" with her chip, and "Feature Roll / Portent" above.
Hooks.on("dnd5e.rollFormulaV2", (rolls, {subject} = {}) => {
    try {
        if (activityIdentifier(subject) !== "syntheticRoll" || subject?.item?.name !== "Portent") return;
        const actor = subject.actor;
        if (!actor) return;
        const token = actor.token ?? actor.getActiveTokens()[0]?.document ?? null;
        const speaker = ChatMessage.getSpeaker({ actor, token });
        for (const roll of rolls ?? []) {
            foundry.utils.setProperty(roll.options, "midi-qol.speaker", speaker);
            foundry.utils.setProperty(roll.options, "midi-qol.rollContext", { type: "utility", itemName: subject.item.name });
        }
    } catch (err) {
        console.error("gambits-premades | Portent die label stamp failed", err);
    }
});

// FORK PATCH (queue T217): dice die at the end of a long rest (RAW), whatever the automation mode —
// in `chat`/`none` nothing re-rolls until someone uses the refresh activity, and a stale die must
// not be spendable meanwhile. `dnd5e.restCompleted` is a LOCAL callAll inside `Actor5e#_rest`, so it
// fires on exactly one client already — the one that performed the rest, which owns the actor — and
// must NOT be gated on `activeGM.isSelf` (that read false for a sole GM and silently skipped the wipe).
// midi's `auto` use starts from the rest CARD, before this hook fires, so a refresh that already wrote
// (fresh stamp) is left alone; one still in flight rewrites the block after us and re-enables the
// effect itself.
Hooks.on("dnd5e.restCompleted", async (actor, result) => {
    try {
        if (!result?.longRest) return;
        let item = actor?.items?.find(i => i.name === "Portent" && i.flags?.["chris-premades"]?.info?.source === "gambits-premades");
        if (!item) return;
        let description = item.system.description.value;
        if (isFreshRefresh(description, Date.now())) return;
        if (!currentPortentDice(description).length) return;
        let stripped = stripPortentDice(description);
        await actor.updateEmbeddedDocuments("Item", [{ _id: item.id, system: { description: { value: stripped } } }]);
        let effectData = Array.from(actor.allApplicableEffects()).find(e => isPortentEffectName(e.name, item.name));
        await effectData?.update({ disabled: true });
        await syncPortentEffect(actor, item, stripped);
    } catch (err) {
        console.error("gambits-premades | Portent rest-time wipe failed", err);
    }
});
