/**
 * Opportunity-Attack region lifecycle: don't outlive the token. (queue T194)
 *
 * An OA region is created per combatant at combat start and stamped with that
 * creature's `actorUuid` / `tokenUuid`. For an UNLINKED token — every NPC and
 * every summon — `actorUuid` is the token-scoped synthetic uuid
 * (`Scene.X.Token.Y.Actor.Z`), so deleting the token makes it unresolvable.
 *
 * ⚠️ Teardown used to be keyed ONLY on combat events (`deleteCombat` /
 * `deleteCombatant`), and Foundry core does NOT delete a Combatant when its
 * Token is deleted — every core caller of `TokenDocument.deleteCombatants` is
 * an explicit user action (the HUD toggle, the token-layer helper). So a token
 * removed mid-combat — a dismissed summon, a cleared corpse — left its region
 * on the scene forever, with a dangling actor uuid.
 *
 * The orphan then keeps firing: any token moving through it calls
 * `opportunityAttackScenarios`, where `fromUuid(actorUuid)` yields null and the
 * unguarded `effectOriginActor.items` read throws. Measured in the live world
 * 2026-08-31: 14 OA regions present with NO combat running, 12 of them orphaned
 * (six of them one repeatedly re-summoned beast).
 *
 * Pure array/string work, injected resolver, so it is node-testable without Foundry.
 */

const NS = "gambits-premades";

const stamp = (region) => region?.flags?.[NS] ?? null;

/**
 * The OA regions belonging to a token that is being deleted.
 *
 * @param {Array<{id: string, flags: object}>} regions Regions on the token's scene.
 * @param {string|null|undefined} tokenUuid The deleted token's uuid.
 * @returns {string[]} Region ids to delete.
 */
export function oaRegionIdsForToken(regions, tokenUuid) {
    // ⚠️ Guard the uuid itself: a null here would match every region whose stamp
    // is also null and delete regions belonging to nobody in particular.
    if (!tokenUuid) return [];
    return (regions ?? [])
        .filter((region) => stamp(region)?.tokenUuid === tokenUuid)
        .map((region) => region.id);
}

/**
 * The OA regions whose creature no longer exists — dead weight from before the
 * `deleteToken` teardown existed, or from any path that removes a token without
 * touching combat.
 *
 * A region counts as orphaned when EITHER stamped uuid fails to resolve: a linked
 * PC stores a world `Actor.` uuid that survives its token, but the region is still
 * dead weight and its token-side reads (`MidiQOL.canSee`) fail downstream.
 *
 * @param {Array<{id: string, flags: object}>} regions Regions to inspect.
 * @param {(uuid: string) => unknown} resolve Uuid resolver (`fromUuidSync` in Foundry).
 * @returns {string[]} Region ids to delete.
 */
export function orphanedOaRegionIds(regions, resolve) {
    return (regions ?? [])
        .filter((region) => {
            const flags = stamp(region);
            // Not ours — never sweep a region we did not create.
            if (!flags?.actorUuid && !flags?.tokenUuid) return false;
            const actorGone = !flags.actorUuid || !resolve(flags.actorUuid);
            const tokenGone = !flags.tokenUuid || !resolve(flags.tokenUuid);
            return actorGone || tokenGone;
        })
        .map((region) => region.id);
}

/**
 * Can this OA event run at all? Both the threatening actor and its token must
 * still exist; an orphaned region resolves neither.
 *
 * @param {{actor: unknown, token: unknown}} resolved
 * @returns {boolean}
 */
export function isOaRegionUsable({ actor, token } = {}) {
    return !!actor && !!token;
}
