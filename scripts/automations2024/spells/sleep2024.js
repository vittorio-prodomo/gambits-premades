export async function sleep2024({ speaker, actor, token, character, item, args, scope, workflow, options, rolledItem, rolledActivity, macroItem }) {
    // ⚠️ FORK PATCH (queue T116). This branch was registered under "preSavesComplete", which is NOT
    // a midi macro pass — it appears at no call site in midi, and `OnUseMacros#getMacros` matches the
    // option string EXACTLY (or the literal "all"). So this whole block had never run once, and the
    // RAW "creatures that don't sleep, such as elves, automatically succeed" clause was silently
    // unenforced. "postSave" is the real pass, fired from `WorkflowState_SavesComplete` with both
    // `saves` and `failedSaves` populated — the same pass Entangle already uses correctly.
    // ⚠️ Changing this means changing the packData `onUseMacroName`/`onUseMacroParts` too; the JS
    // check and the flag must agree or the pass goes inert again in the other direction.
    if(args?.[0].macroPass === "postSave") {
        for (let target of workflow.failedSaves) {
            if(target.actor.system.traits.ci.custom.includes("Magical Sleep") || target.actor.system.traits.ci.value.has("exhaustion")) {
                workflow.failedSaves.delete(target);
                workflow.saves.add(target);
                ui.notifications.warn(game.i18n.localize("GAMBITSPREMADES.Notifications.Automations2024.Spells.Sleep2024.TargetImmuneToSleepOrExhaustion"))
            }
        }

        // T116 (Vittorio's call, 2026-08-02): nobody is going to sleep, so there is nothing left to
        // concentrate on — drop it rather than leaving a dead concentration occupying the slot.
        // ⚠️ Deliberately a RETRACTION, not a prevention: dnd5e begins concentration inside
        // `Activity#use()`, long before any save result exists, so it cannot be pre-empted here.
        // ⚠️ Knowingly NOT RAW — nothing in the spell text ends concentration because everyone saved.
        // ⚠️ Runs after the immunity sweep above on purpose: an elf moved into `saves` must be able
        // to empty `failedSaves` and trigger this.
        // ⚠️ Ending concentration also deletes its dependents, which includes the placed template —
        // intended, since the spell did nothing.
        // ⚠️ Resolve the effect through `actor.concentration`, NOT through the chat card:
        // `chatCard.flags.dnd5e.use.concentrationId` is EMPTY on this path (verified live — the card
        // exists, the flag is null), so keying on it silently never retracts anything.
        // dnd5e stamps the concentration effect with the originating activity, which is the precise
        // handle; the item id is the fallback.
        if(workflow.failedSaves.size === 0) {
            const concentrationEffects = workflow.actor?.concentration?.effects ?? [];
            const concentrationEffect = [...concentrationEffects].find(e =>
                e.flags?.dnd5e?.activity?.uuid === workflow.activity?.uuid)
                ?? [...concentrationEffects].find(e => e.flags?.dnd5e?.item?.id === workflow.item?.id);
            if(concentrationEffect) await workflow.actor.endConcentration(concentrationEffect);
        }
    }

    else if (args?.[0] === "off") {
        let gmUser = game.gps.getPrimaryGM();
        item = await fromUuid(args[2]);
        await game.gps.socket.executeAsUser("gpsActivityUse", gmUser, {itemUuid: item.uuid, identifier: "syntheticSave", targetUuid: token.document.uuid});
    }
}