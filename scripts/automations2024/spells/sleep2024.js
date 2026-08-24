import { actorDoesNotSleep } from "../../utils/doesNotSleep.mjs";
import { shouldFireSleepStage2 } from "../../utils/sleepStage2Gate.mjs";
import { paintAutoSuccessRow } from "../../utils/autoSuccessRow.mjs";
import { buildSleepConfirmRows, applyConfirmSelection } from "../../utils/sleepTargetConfirm.mjs";

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
                // Queue T133: the repaint (class, symbol, AUTOSUCCESS total, escaped attribution
                // tooltip) is now the shared house convention in utils/autoSuccessRow.mjs — the
                // displayed total becomes a localized AUTOSUCCESS label (Vittorio: "seeing an 11 in
                // a green row below a DC of 13 is ugly"), while the real roll stays on hover
                // because `rollHTML` is untouched.
                const row = workflow.saveDisplayData?.find(d => d.id === target.id);
                if(row) {
                    paintAutoSuccessRow(row, {
                        label: game.i18n.localize("GAMBITSPREMADES.AutoSuccess.Label"),
                        // ⚠️ Deliberately does NOT name the creature: the row already identifies it,
                        // and an unnamed string cannot leak a veiled name if the card is composed GM-side.
                        reason: game.i18n.localize("GAMBITSPREMADES.Notifications.Automations2024.Spells.Sleep2024.TargetImmuneToSleepOrExhaustion")
                    });
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
        // ⚠️ FORK PATCH (queue T130). DAE fires this branch on ANY removal of the Incapacitated
        // effect — but only times-up's end-of-turn expiry is the RAW stage-2 trigger. Unconditional,
        // this put two goblins to sleep AFTER Nigel's concentration had ended: the teardown deleted
        // the effect, the branch fired, and the "save vs Unconscious" ran against a dead spell.
        // The deletion's reason rides in DAE's lastArg (`expiry-reason`): 'times-up:turnEnd' is the
        // legit path; concentration teardown / manual removal / Medkit passes arrive as
        // 'effect-deleted' (DAE's default) and must stay silent.
        // Outside combat the stage-2 save never auto-fires (Vittorio 2026-08-24) — the VAE button on
        // the effect (utils/vaeButtons.js) is the manual trigger for out-of-combat play.
        const lastArg = typeof args[args.length - 1] === "object" ? args[args.length - 1] : {};
        // ⚠️ The applied effect's `origin` is the caster's CONCENTRATION effect, not the item
        // ([[gps-fork-setup]] §T114) — which makes it exactly the "is the spell still live?" probe:
        // on a turnEnd expiry it still resolves, on a concentration teardown it is already gone.
        const concentrationAlive = !!(lastArg.origin && await fromUuid(lastArg.origin));
        if (!shouldFireSleepStage2({
            expiryReason: lastArg["expiry-reason"],
            combatStarted: !!game.combat?.started,
            concentrationAlive
        })) return;

        let gmUser = game.gps.getPrimaryGM();
        item = await fromUuid(args[2]);
        await game.gps.socket.executeAsUser("gpsActivityUse", gmUser, {itemUuid: item.uuid, identifier: "syntheticSave", targetUuid: token.document.uuid});
    }
}

/*
 * Queue T131 (+ 08-24 follow-up) — RAW 2024 Sleep is "Each creature of your choice in a
 * 5-foot-radius Sphere". After targeting settles and BEFORE any save rolls, the caster gets a
 * confirmation dialog:
 *  - auto-targeted creatures (midi sweeps hostiles from the template) listed TICKED;
 *  - covered-but-not-auto-targeted creatures — allies, which midi's disposition filter excludes —
 *    listed UNTICKED, so including an ally is a conscious choice (Vittorio's call);
 *  - Confirm applies the selection; Cancel, closing the dialog, or the countdown expiring
 *    CANCELS THE CAST: concentration is retracted (taking the template with it), the spent slot
 *    is refunded from the usage card's own deltas, and the card is deleted — cancel = zero
 *    footprint, the T9 house rule.
 *
 * Registered as a GLOBAL midi hook, not an item onUse pass, deliberately:
 * - `midi-qol.targetingComplete` is awaited (`callCancellableHooks` → `asyncHooksCall`) and fires
 *   in WorkflowState_PreambleComplete — after AoE targeting, before saves — and RETURNING FALSE
 *   aborts the workflow, which is exactly the cancel lever.
 * - No new pass name means NO packData `onUseMacroName` change, no pack rebuild, and no stale-sheet
 *   deployment gap (the §T114 trap) — any item wired to `game.gps.sleep2024` gets the dialog.
 * - The hook runs on the CLIENT DRIVING THE WORKFLOW — the caster's own — so no socket routing.
 *
 * ⚠️ The synthetic stage-2 re-save runs a workflow on the SAME item, so it would re-raise the
 * dialog every turn end without the `syntheticSave` guard.
 * ⚠️ GM-hidden tokens are never listed as extras — a player-facing dialog must not leak them.
 */
export function registerSleepTargetConfirmation() {
    Hooks.on("midi-qol.targetingComplete", async (workflow) => {
        const onUse = workflow?.item?.flags?.["midi-qol"]?.onUseMacroName ?? "";
        if (!onUse.includes("game.gps.sleep2024")) return;
        if (workflow.activity?.midiProperties?.identifier === "syntheticSave") return;

        // Covered-but-not-auto-targeted creatures (allies and neutrals midi's disposition filter
        // skipped). Sleep's template is a circle, whose placeable shape is safe to test directly.
        let extras = [];
        const templateDoc = workflow.templateUuid ? fromUuidSync(workflow.templateUuid) : null;
        const plc = templateDoc?.object;
        if (plc?.shape) {
            extras = canvas.tokens.placeables.filter(t =>
                t.actor
                && !t.document.hidden
                && !workflow.targets.has(t)
                && plc.shape.contains(t.center.x - plc.x, t.center.y - plc.y));
        }
        if (!workflow.targets?.size && !extras.length) return;

        const rows = buildSleepConfirmRows(workflow.targets, extras);
        const rowHtml = rows.map(r => `
            <label class="gps-sleep-confirm-row" style="display:flex;align-items:center;gap:0.5rem;margin:0.15rem 0;${r.extra ? "opacity:0.85;" : ""}">
                <input type="checkbox" name="gps-sleep-keep" value="${r.id}" ${r.checked ? "checked" : ""}>
                <img src="${r.img}" width="28" height="28" style="border:none;flex:0 0 28px;object-fit:cover;">
                <span>${foundry.utils.escapeHTML(r.name ?? "")}</span>
            </label>`).join("");
        const extrasHint = rows.some(r => r.extra)
            ? `<p class="hint">${game.i18n.localize("GAMBITSPREMADES.Dialogs.Automations2024.Spells.Sleep2024.TargetConfirm.ExtrasHint")}</p>`
            : "";
        const content = `
            <p>${game.i18n.localize("GAMBITSPREMADES.Dialogs.Automations2024.Spells.Sleep2024.TargetConfirm.Content")}</p>
            <div class="gps-sleep-confirm-list">${rowHtml}</div>${extrasHint}`;

        const dialogId = "gps-sleep-target-confirm";
        const initialTimeLeft = 30;
        let keptIds = null;
        try {
            keptIds = await foundry.applications.api.DialogV2.wait({
                window: { title: game.i18n.localize("GAMBITSPREMADES.Dialogs.Automations2024.Spells.Sleep2024.TargetConfirm.Title") },
                content,
                buttons: [{
                    action: "confirm",
                    label: game.i18n.localize("GAMBITSPREMADES.Dialogs.Automations2024.Spells.Sleep2024.TargetConfirm.Confirm"),
                    default: true,
                    callback: (event, button, dialog) => {
                        const root = dialog?.element ?? button?.form ?? document;
                        return [...root.querySelectorAll('input[name="gps-sleep-keep"]:checked')].map(i => i.value);
                    }
                }, {
                    action: "cancel",
                    label: game.i18n.localize("GAMBITSPREMADES.Dialogs.Automations2024.Spells.Sleep2024.TargetConfirm.Cancel"),
                    callback: () => null
                }],
                render: (event, dialog) => {
                    // House chrome (T106b): shrinking title-bar countdown. Read at CALL time —
                    // `game.gps` is reassigned wholesale at ready — and null-guarded so a missing
                    // GPS build degrades to a plain dialog that simply waits.
                    // ⚠️ attachCountdownChrome owns its own expiry and closes the dialog — the
                    // `null` result from a closed dialog cancels the cast below, same as the X.
                    game.gps?.attachCountdownChrome?.(dialog, { dialogId, dialogTitle: dialog?.window?.title, initialTimeLeft });
                },
                close: () => null,
                rejectClose: false
            });
        } catch (err) {
            console.warn("gambits-premades | Sleep target confirmation failed open (keeping all targets)", err);
            return; // a broken dialog must not cancel a legitimate cast
        }

        // Cancel / close / timeout: unwind the cast to zero footprint (Vittorio 2026-08-24).
        if (!Array.isArray(keptIds)) {
            // 1. Retract the concentration dnd5e already began inside Activity#use — this also
            //    deletes the placed template, a dependent (§T116).
            const concentrationEffects = workflow.actor?.concentration?.effects ?? [];
            const concentrationEffect = [...concentrationEffects].find(e =>
                e.flags?.dnd5e?.activity?.uuid === workflow.activity?.uuid)
                ?? [...concentrationEffects].find(e => e.flags?.dnd5e?.item?.id === workflow.item?.id);
            if (concentrationEffect) await workflow.actor.endConcentration(concentrationEffect);
            // 2. Refund the consumption from the usage card's own deltas (dnd5e's Refund
            //    mechanism), then delete the card — cancel = zero footprint (T9 house rule).
            const card = workflow.itemCardUuid ? await fromUuid(workflow.itemCardUuid) : null;
            if (card?.system?.deltas) await workflow.activity.refund(card.system.deltas);
            if (card) await card.delete().catch(() => {});
            // 3. Belt-and-braces: the template, if concentration somehow did not own it.
            const leftoverTemplate = workflow.templateUuid ? fromUuidSync(workflow.templateUuid) : null;
            if (leftoverTemplate) await leftoverTemplate.delete().catch(() => {});
            ui.notifications.info(game.i18n.localize("GAMBITSPREMADES.Notifications.Automations2024.Spells.Sleep2024.CastCancelled"));
            return false; // aborts the workflow
        }

        const {removed, added} = applyConfirmSelection(workflow.targets, keptIds, extras);
        // Keep the canvas targeting in agreement with the card, both directions.
        for (const t of removed) t.setTarget?.(false, { releaseOthers: false, groupSelection: true });
        for (const t of added) t.setTarget?.(true, { releaseOthers: false, groupSelection: true });
    });
}
