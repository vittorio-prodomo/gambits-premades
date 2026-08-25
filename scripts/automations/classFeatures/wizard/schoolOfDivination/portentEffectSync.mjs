/*
 * Queue T155 — mirror the CURRENT Portent dice into the buff (transfer effect) title and
 * tooltip. The dice live only inside the item description as
 * `<span id="portentRollN">VALUE</span>`; the effect name/description never mentioned them,
 * so the token buff said just "Portent". Pure (regex over HTML we generate ourselves), so it
 * runs under node tests without a DOM.
 */
export function currentPortentDice(descriptionHtml) {
    const dice = [];
    const re = /<span id="portentRoll\d+">\s*(?:<[^>]+>\s*)*([^<\s][^<]*?)\s*(?:<\/[^>]+>\s*)*<\/span>/g;
    let m;
    while ((m = re.exec(descriptionHtml ?? '')) !== null) dice.push(m[1]);
    return dice;
}

export function portentEffectPatch(baseName, dice, {activeText, emptyText}) {
    if (dice.length) {
        return {
            name: `${baseName} (${dice.join(', ')})`,
            description: activeText,
        };
    }
    return {name: baseName, description: emptyText};
}

/* The effect may already carry a previous "(7, 15)" suffix — match both shapes. */
export function isPortentEffectName(effectName, baseName) {
    return effectName === baseName || (effectName ?? '').startsWith(`${baseName} (`);
}
