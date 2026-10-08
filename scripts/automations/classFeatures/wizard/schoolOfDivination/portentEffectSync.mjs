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

/*
 * Queue T234 — the Argon button opens a three-way menu (spend · refresh · enter by hand), the
 * long-rest refresh asks instead of rolling, and the dice can be typed in (physical dice).
 */
export const PORTENT_SET_IDENTIFIER = 'portentSet';
export const PORTENT_SYNTHETIC_IDENTIFIER = 'syntheticRoll';

/** The player-facing spend activity is the one that is none of the plumbing. */
export function isSpendIdentifier(identifier) {
    return ![PORTENT_REFRESH_IDENTIFIER, PORTENT_SET_IDENTIFIER, PORTENT_SYNTHETIC_IDENTIFIER].includes(identifier);
}

/**
 * The dice block a refresh (rolled) or a hand entry writes at the head of the description —
 * one `<div id="Portent Roll N">` per die, numbered from 1 with no gaps, closed by the stamped marker.
 * @param {(number|string)[]} values
 * @param {{header: string, label: (i: number) => string, now: number}} parts
 */
export function portentDiceBlock(values, {header, label, now}) {
    let block = header;
    values.forEach((value, index) => {
        const i = index + 1;
        block += `<div id="Portent Roll ${i}">${label(i)} <b><span id="portentRoll${i}">${value}</span></b></div>`;
    });
    return block + '<br>' + portentMarker(now);
}

/**
 * Validate hand-typed dice. An empty field means "that die does not exist"; anything else must be
 * a whole number from 1 to 20.
 * @param {unknown[]} raw  one entry per field
 * @returns {{values: number[], error: null|'range'|'empty'}}
 */
export function parsePortentInput(raw) {
    const values = [];
    for (const entry of raw ?? []) {
        const text = String(entry ?? '').trim();
        if (text === '') continue;
        if (!/^\d+$/.test(text)) return {values: [], error: 'range'};
        const value = Number(text);
        if (value < 1 || value > 20) return {values: [], error: 'range'};
        values.push(value);
    }
    if (!values.length) return {values: [], error: 'empty'};
    return {values, error: null};
}

/**
 * Did this click come from the Argon HUD? (`usageConfig.event` of a HUD button.) The HUD root is
 * `<div id="core-hud" class="extended-combat-hud …">` — matched on the class, verified live.
 */
export const ARGON_HUD_SELECTOR = '.extended-combat-hud';
export function isHudOrigin(event) {
    const el = event?.currentTarget?.closest ? event.currentTarget : event?.target;
    if (typeof el?.closest !== 'function') return false;
    return !!el.closest(ARGON_HUD_SELECTOR);
}

/**
 * Is this use midi's Activation Cost Automation firing a rest activity? Its call is
 * `completeActivityUse(activity, {midiOptions: {noUseWarning: true}}, {}, {})` (midi `Hooks.ts`,
 * the `preCreateChatMessage` handler) — no event, and that one option. If midi ever changes the
 * call this reads false and the refresh simply rolls on its own again, as it did before T234.
 */
export function isRestActivation(usageConfig) {
    return usageConfig?.midiOptions?.noUseWarning === true && !usageConfig?.event;
}

/**
 * Who a dice message is whispered to. Rolled dice: the character's player. Typed dice: the player
 * and the GMs. NEVER empty — an empty whisper list is a PUBLIC message, which would show the dice
 * to the whole table when the actor has no resolvable player; the writing user is the fallback.
 * @param {{playerId?: string, gmIds?: string[], selfId: string, byHand?: boolean}} who
 */
export function whisperRecipients({playerId, gmIds = [], selfId, byHand = false}) {
    const ids = [playerId, ...(byHand ? gmIds : [])].filter(Boolean);
    if (!ids.length) ids.push(selfId);
    return Array.from(new Set(ids));
}

/**
 * May this long-rest prompt open here? It arrives over the socket, so any connected user can send
 * it at any user for any actor: the SENDER must be a GM or own the actor (a player can only ever
 * prompt for their own character, whose dice they could re-roll anyway), and the RECEIVER must own
 * it too (else the prompt would name an actor that user may not even see, and could not write).
 */
export function restPromptAllowed({senderIsGM, senderOwns, receiverOwns}) {
    return !!receiverOwns && (!!senderIsGM || !!senderOwns);
}

/** The long-rest prompt answers itself "later" after this many seconds (his call, 2026-10-04). */
export const REST_PROMPT_SECONDS = 40;

/** The "later" button counts the remaining seconds down: "I'll roll them later (40)". */
export function countdownLabel(label, secondsLeft) {
    return `${label} (${Math.max(0, Math.ceil(secondsLeft))})`;
}


/**
 * Queue T237 — the dice as whole faces (1–20), in the order they are stored. Anything else
 * (a hand-edited description, "N/A") is not a die a d20 can be replaced with.
 * @param {string|null|undefined} descriptionHtml
 * @returns {number[]}
 */
export function portentDiceValues(descriptionHtml) {
    return currentPortentDice(descriptionHtml)
        .map(v => Number(String(v).trim()))
        .filter(n => Number.isInteger(n) && n >= 1 && n <= 20);
}

/**
 * Queue T237 — spend a die by VALUE: drop the first `<div id="Portent Roll N">` whose stored value
 * equals `value`. The pre-roll prompt knows which face the player chose, not which slot holds it;
 * with two equal dice it does not matter which one goes.
 * @param {string|null|undefined} descriptionHtml
 * @param {number|string} value
 * @returns {{html: string, removed: boolean}}
 */
export function removePortentDie(descriptionHtml, value) {
    const html = descriptionHtml ?? '';
    const wanted = String(value).trim();
    const divRe = /<div id="Portent Roll \d+">[\s\S]*?<\/div>/g;
    let m;
    while ((m = divRe.exec(html)) !== null) {
        const [stored] = currentPortentDice(m[0]);
        if (stored !== undefined && String(stored).trim() === wanted) {
            return { html: html.slice(0, m.index) + html.slice(m.index + m[0].length), removed: true };
        }
    }
    return { html, removed: false };
}
