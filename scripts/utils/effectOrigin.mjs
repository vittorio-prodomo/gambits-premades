/**
 * Resolve the Item uuid an ActiveEffect came from. (queue T114)
 *
 * An applied effect's `origin` is not reliably an Item: DAE stamps
 * `options.origin ?? activityEffects[i].uuid`, so depending on the call path it can be the
 * item uuid OR the activity's. A VAE button that needs the granting item (for its DC and
 * its escape activity) must cope with both, and must fail quietly rather than throw inside
 * a click handler.
 *
 * Pure string work so it is node-testable without Foundry.
 *
 * @param {string|null|undefined} origin An ActiveEffect's `origin`.
 * @returns {string|null} The Item uuid, or null if the origin names no item.
 */
export function itemUuidFromOrigin(origin) {
    if (typeof origin !== 'string' || !origin) return null;
    const parts = origin.split('.');
    const itemIndex = parts.lastIndexOf('Item');
    if (itemIndex === -1 || itemIndex + 1 >= parts.length) return null;
    return parts.slice(0, itemIndex + 2).join('.');
}
