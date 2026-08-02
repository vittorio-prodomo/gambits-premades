import { actorDoesNotSleep } from "../../utils/doesNotSleep.mjs";

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
        let reclassified = false;
        for (let target of workflow.failedSaves) {
            // ⚠️ FORK PATCH (queue T122). This was `ci.custom.includes("Magical Sleep") ||
            // ci.value.has("exhaustion")` — and NOTHING in this stack writes "Magical Sleep", so the
            // elf half matched nobody. The party's real value is ";Sleep" (ddb-importer generates it
            // from the 2024 Trance feature), and a survey found those two PCs are the ONLY actors in
            // the world with any custom trait at all. The 08-02 verification set the string by hand,
            // which is why it passed while the rule stayed dead at the table.
            // The predicate now covers exhaustion, a loosely-matched declared immunity, Undead and
            // Constructs, and elf lineages — see doesNotSleep.mjs for why each limb is load-bearing.
            if(actorDoesNotSleep(target.actor)) {
                workflow.failedSaves.delete(target);
                workflow.saves.add(target);
                reclassified = true;

                // ⚠️ The card is drawn BEFORE this pass runs (`displaySaves` at Workflow.ts:2782,
                // `postSave` at :2792, with no re-render in between), so reclassifying alone leaves
                // the card showing a FAILED save for a creature we are treating as having succeeded.
                // Repaint that target's row from midi's own display data, then re-render below.
                const row = workflow.saveDisplayData?.find(d => d.id === target.id);
                if(row) {
                    row.saveClass = "success";
                    row.saveSymbol = (row.saveSymbol ?? "").replace("fa-xmark", "fa-check");
                    // midi's per-target attribution tooltip is the natural home for the reason: it is
                    // permanent, attached to the right creature, and visible to everyone who can see
                    // the card — unlike the `ui.notifications.warn` this replaces, which was transient,
                    // unattributed, and only ever rendered on the one client that ran the macro.
                    // ⚠️ `attributionTooltip` is stored HTML-ESCAPED (the template emits it into
                    // data-tooltip-html via a triple-stash), so an addition must be escaped the same way.
                    // ⚠️ Deliberately does NOT name the creature: the row already identifies it, and an
                    // unnamed string cannot leak a veiled name if this card is composed GM-side.
                    const reason = game.i18n.localize("GAMBITSPREMADES.Notifications.Automations2024.Spells.Sleep2024.TargetImmuneToSleepOrExhaustion");
                    const escaped = foundry.utils.escapeHTML(reason);
                    row.attributionTooltip = row.attributionTooltip ? `${row.attributionTooltip}<br>${escaped}` : escaped;
                    row.hasAttribution = true;
                }
            }
        }
        // ⚠️ Safe to re-call: `displaySaves` REPLACES its block by regex rather than appending, so a
        // second render simply redraws the saves section from the corrected data.
        if(reclassified) await workflow.displaySaves(false);

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