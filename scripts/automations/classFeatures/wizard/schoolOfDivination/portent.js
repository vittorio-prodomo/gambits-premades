import {currentPortentDice, portentEffectPatch, isPortentEffectName, portentMarker, portentFeatureText, stripPortentDice, isFreshRefresh, activityIdentifier, PORTENT_REFRESH_IDENTIFIER} from './portentEffectSync.mjs';

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
        if(!portentRollDivs || portentRollDivs.length === 0) return workflow.aborted = true;

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
                    let replaceString = `<div class="midi-qol-attack-roll"><span style='text-wrap: wrap;'>${game.i18n.format("GAMBITSPREMADES.ChatMessages.Automations.ClassFeatures.Wizard.SchoolOfDivination.Portent.PortentApplied", { portentLabel: divContent.id, roll: roll })}</span><div class="end-midi-qol-attack-roll">`;
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
                                        <img src="${item.img}" class="gps-dialog-image">
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
    let diceResult = "Your portent rolls are:<br><br>";

    for (let i = 1; i <= diceNum; i++) {
        let roll = await game.gps.gpsActivityUse({itemUuid: item.uuid, identifier: "syntheticRoll", targetUuid: tok.document.uuid});

        let result = roll?.utilityRolls?.total;

        diceResult += `<div id="Portent Roll ${i}">${game.i18n.format("GAMBITSPREMADES.ChatMessages.Automations.ClassFeatures.Wizard.SchoolOfDivination.Portent.PortentRoll", { i: i })} <b><span id="portentRoll${i}">${result}</span></b></div>`;
    }

    // The marker is stamped so the rest-time wipe can tell this refresh from yesterday's dice.
    diceResult += '<br>' + portentMarker(Date.now());

    let actorPlayer = MidiQOL.playerForActor(actor);
    let chatData = {
        speaker: ChatMessage.getSpeaker(),
        content: diceResult,
        whisper: actorPlayer.id
    };
    await ChatMessage.create(chatData);

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

// FORK PATCH (queue T217): neither the refresh activity nor the two synthetic d20 uses it drives should
// post an item card — each one printed the feature text WITH the current dice to the whole table (the
// old DAE path leaked the two synthetic cards too; verified standalone). The dice reach the player
// through the whispered "Your portent rolls are" message only. midi's workflow runs fine without the
// card for a utility with no roll (verified live: manual refresh, three uses suppressed, no errors).
Hooks.on("dnd5e.preUseActivity", (activity, usageConfig, dialogConfig, messageConfig) => {
    const id = activityIdentifier(activity);
    if (id !== PORTENT_REFRESH_IDENTIFIER && id !== "syntheticRoll") return;
    if (activity?.item?.name !== "Portent") return;
    if (messageConfig) messageConfig.create = false;
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
