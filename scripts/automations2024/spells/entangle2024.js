export async function entangle2024({ tokenUuid, regionUuid, regionScenario, speaker, actor, token, character, item, args, scope, workflow, options }) {
    // ⚠️ FORK PATCH (queue T114). Restrained used to be applied here by hand as a BARE CORE STATUS
    // via `gmToggleStatus`, which carries no origin and ties the condition to nothing — so no VAE
    // button could find its way back to the spell, and ending concentration left the vines behind.
    // It is now a real named effect authored in packData and listed in the save activity's `effects`
    // array (`onSave: false`), exactly as Sleep does in this same module, so midi/DAE apply it and
    // it gets an `origin` for free. This loop therefore only draws the animation.
    // ⚠️ The caster is NO LONGER exempt (Vittorio 2026-08-02): the old loop skipped `token`, but RAW
    // the spell restrains *each creature in that area*, and the item already sets midi's
    // `AoETargetTypeIncludeSelf`, so a caster standing in their own vines was being targeted, made to
    // save, and then silently spared. Letting midi apply to every failed save is the RAW behaviour.
    if(args?.[0].macroPass === "postSave")
    {
        const template = await fromUuid(workflow.templateUuid);
        const targets = Array.from(workflow.failedSaves);

        await game.gps.animation.entangle({template, itemUuid: workflow.item.uuid, targets, token});
    }

    // ⚠️ Nothing in this stack links an activity-applied effect to the caster's concentration:
    // DAE's `doActivityEffects` sets `origin` only, and midi's `dependentOn` wiring sits in the
    // Convenient-Effects branch, which this item disables (`forceCEOff`). So the link is made
    // explicitly here, at `postActiveEffects` — the first pass at which the effects exist.
    // ⚠️ `MidiQOL.addConcentrationDependent` resolves the concentration through `actor.concentration`,
    // NOT through `chatCard.flags.dnd5e.use.concentrationId`, which is null on this path (T116).
    // ⚠️ Registering a new pass means declaring it in the packData `onUseMacroName` too, or it is
    // silently never called (T116).
    if(args?.[0].macroPass === "postActiveEffects")
    {
        for (let target of workflow.failedSaves) {
            const applied = target.actor?.effects?.find(e => e.flags?.["gambits-premades"]?.entangleRestrained);
            if (!applied) continue;
            await MidiQOL.addConcentrationDependent(workflow.actor, applied, workflow.item);
        }
    }

    if(regionScenario === "tokenTurnStart") {
        if(!tokenUuid || !regionUuid || !regionScenario) {
            if(debugEnabled) game.gps.logInfo(`No Region or Token found for ${itemName}`);
            return;
        }

        let region = await fromUuid(regionUuid);
        let tokenDocument = await fromUuid(tokenUuid);
        let token = tokenDocument?.object;
        actor = tokenDocument.actor;
        item = await fromUuid(region.flags["region-attacher"].itemUuid);

        // ⚠️ Gate on OUR effect, not on the `restrained` status (T114): a creature restrained by
        // something else standing in the vines would otherwise be offered an Entangle escape that
        // could not free it.
        const hasEffectApplied = !!tokenDocument.actor?.effects?.find(e => e.flags?.["gambits-premades"]?.entangleRestrained);
        if(!hasEffectApplied) return;

        let dialogId = "entangle";
        let dialogTitlePrimary = `${token.actor.name} | ${item.name}`;
        let browserUser = game.gps.getBrowserUser({ actorUuid: actor.uuid });
        let gmUser = game.gps.getPrimaryGM();

        let dialogContent = `
            <div class="gps-dialog-container">
                <div class="gps-dialog-section">
                    <div class="gps-dialog-content">
                        <div>
                            <div class="gps-dialog-flex">
                                <p class="gps-dialog-paragraph">${game.i18n.localize("GAMBITSPREMADES.Dialogs.Automations2024.Spells.Entangle2024.Prompts.UseYourAction.Default")}</p>
                                <div id="image-container" class="gps-dialog-image-container">
                                    <img id="img_${dialogId}" src="${item.img}" class="gps-dialog-image">
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="gps-dialog-button-container">
                    <button id="pauseButton_${dialogId}" type="button" class="gps-dialog-button">
                        <i class="fas fa-pause" id="pauseIcon_${dialogId}" style="margin-right: 5px;"></i>${game.i18n.localize("GAMBITSPREMADES.Dialogs.Common.Pause")}
                    </button>
                </div>
            </div>
        `;
        
        let result = await game.gps.socket.executeAsUser("process3rdPartyReactionDialog", browserUser, {dialogTitle:dialogTitlePrimary,dialogContent,dialogId,initialTimeLeft: 30,validTokenPrimaryUuid: tokenDocument.uuid,source:gmUser === browserUser ? "gm" : "user",type:"singleDialog"});
                
        const { userDecision, enemyTokenUuid, allyTokenUuid, damageChosen, abilityCheck, source, type } = result || {};

        if (!userDecision) {
            return;
        }
        else if (userDecision) {
            const saveResult = await game.gps.gpsActivityUse({itemUuid: item.uuid, identifier: "syntheticSave", targetUuid: tokenDocument.uuid});

            if (saveResult.failedSaves.size === 0)
            {
                await releaseFromEntangle(tokenDocument);
            }
        }
    }

    if(regionScenario === "tokenExits") {
        let tokenDocument = await fromUuid(tokenUuid);
        await releaseFromEntangle(tokenDocument);
    }
}

/**
 * End one creature's entanglement: delete the effect and stop its vines animation. (T114)
 *
 * ⚠️ Deliberately keyed on OUR flag, not on the `restrained` status: a creature can be Restrained by
 * something else at the same time, and the old `gmToggleStatus(active:false)` would have cleared that
 * too. Deleting our own named effect removes only what Entangle applied — and because the effect
 * carries `statuses: ["restrained"]`, the condition lifts with it unless another source still grants it.
 *
 * Shared by the turn-start escape, the region exit, and the VAE button, so the three paths cannot drift.
 * @param {TokenDocument} tokenDocument The restrained creature's token.
 * @returns {Promise<boolean>} Whether an Entangle effect was found and removed.
 */
export async function releaseFromEntangle(tokenDocument) {
    if(!tokenDocument?.actor) return false;
    const applied = tokenDocument.actor.effects.find(e => e.flags?.["gambits-premades"]?.entangleRestrained);
    if(applied) await game.gps.socket.executeAsGM("gmDeleteEffect", { effectUuid: applied.uuid });
    Sequencer.EffectManager.endEffects({ name: `${tokenDocument.id}Entangle`, object: tokenDocument.object });
    return !!applied;
}