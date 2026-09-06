import { itemUuidFromOrigin } from "./effectOrigin.mjs";
import { releaseFromEntangle } from "../automations2024/spells/entangle2024.js";
import { resolveSleepStageTwo } from "../automations2024/spells/sleep2024.js";
import { isSleepIncapacitated } from "./sleepStageTwo.mjs";

/**
 * Visual Active Effects buttons owned by GPS. (queue T114)
 *
 * VAE's contract is one hook and two fields: `Hooks.callAll("visual-active-effects.createEffectButtons",
 * effect, buttons)`, each button `{label, callback}` (anything else is filtered out).
 *
 * ⚠️ This is GPS's FIRST VAE integration, and it must be registered globally — the per-spell
 * automations only run on their own midi/region triggers, so registering inside one would mean the
 * button exists only while that automation happens to be executing.
 *
 * ⚠️ Registered at `ready`, not `init`: VAE is an optional dependency and the callbacks reach into
 * `game.gps`, which is assembled at GPS's own ready.
 */
export function registerVaeButtons() {
    if (!game.modules.get("visual-active-effects")?.active) return;

    Hooks.on("visual-active-effects.createEffectButtons", (effect, buttons) => {
        if (effect?.flags?.["gambits-premades"]?.entangleRestrained) {
            buttons.push({
                label: game.i18n.localize("GAMBITSPREMADES.Dialogs.Automations2024.Spells.Entangle2024.Buttons.Escape"),
                callback: () => escapeEntangle(effect)
            });
            return;
        }

        // Queue T130: Sleep's stage-2 "save vs Unconscious" never auto-fires outside combat (the
        // per-turn repeat only runs on combat turns), so the Incapacitated effect carries the
        // manual trigger. Since the 2.1.44 model (2026-09-06) the gate is the stable gpsUuid
        // upstream stamps on that effect — sync, so the hook can use it; the callback still verifies
        // the resolved item really is wired to the sleep automation before rolling.
        if (isSleepIncapacitated(effect)) {
            buttons.push({
                label: game.i18n.localize("GAMBITSPREMADES.Dialogs.Automations2024.Spells.Sleep2024.Buttons.StageTwoSave"),
                callback: () => rollSleepStageTwo(effect)
            });
        }
    });
}

/**
 * Roll Sleep's stage-2 "save vs Unconscious" from the Incapacitated effect's VAE tooltip. (T130)
 *
 * The manual counterpart of the automated end-of-turn trigger — Vittorio's out-of-combat and
 * GM-fiat entry point. Runs the exact same `syntheticSave` activity through the same GM-routed
 * socket as the automated path, so the two cannot disagree about DC or ability.
 *
 * @param {ActiveEffect} effect The Sleep: Incapacitated effect carrying the button.
 */
async function rollSleepStageTwo(effect) {
    const itemUuid = await resolveSourceItemUuid(effect);
    const item = itemUuid ? await fromUuid(itemUuid) : null;
    // Verify the async half of the gate: this effect must belong to the Sleep automation.
    if (!item?.flags?.["midi-qol"]?.onUseMacroName?.includes("game.gps.sleep2024")) {
        return void ui.notifications.warn(game.i18n.localize("GAMBITSPREMADES.Notifications.Automations2024.Spells.Sleep2024.NoOrigin"));
    }

    const tokenDocument = effect.parent?.token ?? effect.parent?.getActiveTokens?.(false, true)?.[0];
    if (!tokenDocument) return void ui.notifications.warn(game.i18n.localize("GAMBITSPREMADES.Notifications.Automations2024.Spells.Sleep2024.NoToken"));

    const token = tokenDocument.object ?? canvas?.tokens?.get?.(tokenDocument.id);
    if (!token) return void ui.notifications.warn(game.i18n.localize("GAMBITSPREMADES.Notifications.Automations2024.Spells.Sleep2024.NoToken"));

    // Same routine as the automated end-of-turn trigger: GM-routed synthetic save, then the
    // Incapacitated effect is consumed either way (T130 follow-up, Vittorio 2026-08-24: RAW gives
    // no third save, and a failure has Unconscious applied by the syntheticSave activity).
    await resolveSleepStageTwo(item, token);
}

/**
 * Find the item that granted an applied effect. (T114)
 *
 * ⚠️ Verified live 2026-08-02, and it is NOT what the plain reading suggests: for a CONCENTRATION
 * spell whose effects are applied through the activity, midi stamps the applied effect's `origin`
 * with the caster's **concentration effect**, not with the item — observed
 * `origin = "Actor.<id>.ActiveEffect.<concentrationId>"`. So parsing the origin string alone returns
 * null and the button silently does nothing. The concentration effect is still a precise handle:
 * dnd5e stamps it with both `flags.dnd5e.activity.uuid` and `flags.dnd5e.item.id`.
 *
 * Ordered most precise first: a direct item origin, then the activity behind the concentration,
 * then the item id on the concentration's own actor.
 *
 * @param {ActiveEffect} effect
 * @returns {Promise<string|null>} The granting item's uuid, or null.
 */
async function resolveSourceItemUuid(effect) {
    const direct = itemUuidFromOrigin(effect?.origin);
    if (direct) return direct;

    const originDoc = effect?.origin ? await fromUuid(effect.origin) : null;
    if (!originDoc) return null;

    const viaActivity = itemUuidFromOrigin(originDoc.flags?.dnd5e?.activity?.uuid);
    if (viaActivity) return viaActivity;

    const itemId = originDoc.flags?.dnd5e?.item?.id;
    return itemId ? (originDoc.parent?.items?.get(itemId)?.uuid ?? null) : null;
}

/**
 * Run Entangle's escape attempt from the effect's own VAE tooltip. (T114)
 *
 * Deliberately a SECOND entry point, not a replacement for the turn-start dialog (Vittorio's call):
 * the same underlying activity runs either way, so the two cannot disagree about the DC or the
 * ability. That activity is a `check` despite its `syntheticSave` identifier — Strength (Athletics)
 * against the caster's spell save DC, which is RAW.
 *
 * ⚠️ The item is resolved from `effect.origin`, which is exactly what the T114 packData change bought:
 * before it, Restrained was a bare core status with no origin and the only route back to the spell was
 * the region's `region-attacher` flag, which is ambiguous when two Entangles overlap.
 *
 * @param {ActiveEffect} effect The Entangle Restrained effect carrying the button.
 */
async function escapeEntangle(effect) {
    const itemUuid = await resolveSourceItemUuid(effect);
    if (!itemUuid) return void ui.notifications.warn(game.i18n.localize("GAMBITSPREMADES.Notifications.Automations2024.Spells.Entangle2024.NoOrigin"));

    const tokenDocument = effect.parent?.token ?? effect.parent?.getActiveTokens?.(false, true)?.[0];
    if (!tokenDocument) return void ui.notifications.warn(game.i18n.localize("GAMBITSPREMADES.Notifications.Automations2024.Spells.Entangle2024.NoToken"));

    // Route the roll through the GM for the same reason the turn-start branch does: the check is made
    // against the caster's item, which the escaping creature's owner may not own.
    const gmUser = game.gps.getPrimaryGM();
    const saveResult = await game.gps.socket.executeAsUser("gpsActivityUse", gmUser, {
        itemUuid,
        identifier: "syntheticSave",
        targetUuid: tokenDocument.uuid
    });

    // gpsActivityUse reports the CHECK's failures; an empty set means the creature beat the DC.
    if (saveResult?.failedSaves?.size === 0) await releaseFromEntangle(tokenDocument);
}
