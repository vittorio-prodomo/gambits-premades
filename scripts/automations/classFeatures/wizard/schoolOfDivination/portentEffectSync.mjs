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

/*
 * Queue T217 — the refresh rides dnd5e's native long-rest activation instead of a DAE expiry.
 * The dice block ends in a marker div; the refresh stamps it with the time it was written so
 * the rest-time wipe can tell "yesterday's dice" from "the refresh that just ran" — midi's
 * auto-use of a long-rest activity starts from the rest CARD, ten lines before
 * `dnd5e.restCompleted` fires, so the two race and the wipe must never eat a fresh roll.
 */
export const PORTENT_MARKER_ID = 'endPortentRolls';
const MARKER_RE = /<div id="endPortentRolls"(?:\s+data-refreshed="(\d+)")?><\/div>/;

/** The marker div, stamped with `now` (ms). */
export function portentMarker(now) {
    return `<div id="${PORTENT_MARKER_ID}" data-refreshed="${now}"></div>`;
}

/** Everything after the marker is the feature's own text; everything before it is ours. */
export function portentFeatureText(descriptionHtml) {
    const html = descriptionHtml ?? '';
    const m = MARKER_RE.exec(html);
    if (!m) return html;
    return html.slice(m.index + m[0].length);
}

/** Age of the last refresh in ms, or null when the block carries no stamp (legacy shape or no dice). */
export function portentRefreshAge(descriptionHtml, now) {
    const m = MARKER_RE.exec(descriptionHtml ?? '');
    if (!m || !m[1]) return null;
    return now - Number(m[1]);
}

/**
 * The description with the dice removed (a bare, unstamped marker remains so the next refresh
 * finds its anchor). Returns the input unchanged when there is nothing to strip.
 */
export function stripPortentDice(descriptionHtml) {
    const html = descriptionHtml ?? '';
    if (!MARKER_RE.test(html) && !currentPortentDice(html).length) return html;
    return `<div id="${PORTENT_MARKER_ID}"></div>` + portentFeatureText(html);
}

/**
 * Should a rest-time wipe leave this description alone? Yes when a refresh wrote it within
 * `windowMs` — that is the refresh that midi's auto-use just ran for THIS rest.
 */
export function isFreshRefresh(descriptionHtml, now, windowMs = 120000) {
    const age = portentRefreshAge(descriptionHtml, now);
    return age !== null && age >= 0 && age < windowMs;
}

/**
 * An activity's identifier — midi's mixin API, which reads `undefined` without midi
 * (landmine: "looks like dnd5e API, is midi's") — with a name-slug fallback.
 */
export function activityIdentifier(activity) {
    if (!activity) return '';
    if (typeof activity.identifier === 'string' && activity.identifier) return activity.identifier;
    return (activity.name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export const PORTENT_REFRESH_IDENTIFIER = 'portentRefresh';
