/**
 * Does this creature sleep? (queue T122)
 *
 * The 2024 Sleep spell auto-succeeds "Creatures that don't sleep, such as elves, or that have
 * Immunity to the Exhaustion condition". T116 implemented that as a single test against
 * `traits.ci.custom.includes("Magical Sleep")` — a string nothing in this stack ever writes, so the
 * limb matched NOBODY. The party's actual value is `";Sleep"`.
 *
 * ⚠️ Do not "simplify" this back to one check. Each limb covers creatures the others cannot see:
 *
 *  1. `exhaustion` condition immunity — named explicitly in the spell text.
 *  2. A declared sleep immunity in the free-text custom traits. ddb-importer generates this from
 *     the 2024 Elf's TRANCE feature ("magic can't put you to sleep") and writes it as `";Sleep"` —
 *     note the leading semicolon, an upstream split(":")/join(";") mismatch. It is regenerated on
 *     every re-import, so it is durable data, not residue. Matched loosely because the exact string
 *     is not ours to control and a GM may reasonably type "Magical Sleep" or "sleep".
 *  3. Undead and Constructs (Vittorio's call, 2026-08-02): more RAW-correct than an elf-only rule,
 *     since the spell says "creatures that don't sleep" and only offers elves as an *example*.
 *  4. Elves by species — the fallback for anything the sheet never declared. ⚠️ This is the only
 *     limb that reaches an NPC elf: a survey of the live world found 0 of 164 NPCs carrying a race
 *     item or any custom trait, so limbs 2 and 4-via-race never fire for them and only the
 *     `details.type.subtype` half does.
 *
 * Pure data-in/data-out so it is node-testable without Foundry.
 */

const NON_SLEEPING_TYPES = new Set(['undead', 'construct']);

/*
 * ⚠️ 2014 Half-Elves have Fey Ancestry but DO sleep — the sleep clause was always Elf-only — and
 * `\belf\b` matches "half-elf" because the hyphen is a word boundary. This rejection has to come
 * first or a Half-Elf is silently made immune.
 */
const HALF_ELF = /half[-\s]?elf/i;
const ELF = /\belf\b|\bdrow\b|\beladrin\b/i;

/**
 * @param {string} text Any species-ish label: a race item name, its identifier, an NPC subtype.
 * @returns {boolean} True if it names an elf lineage (and is not a half-elf).
 */
export function namesAnElf(text) {
    if (typeof text !== 'string' || !text) return false;
    if (HALF_ELF.test(text)) return false;
    return ELF.test(text);
}

/**
 * @param {object} descriptor
 * @param {string[]} [descriptor.conditionImmunities] `traits.ci.value`, as an array.
 * @param {string} [descriptor.customImmunities] `traits.ci.custom`, verbatim.
 * @param {string} [descriptor.creatureType] `details.type.value`.
 * @param {string[]} [descriptor.speciesLabels] Every label that might name the species.
 * @returns {boolean}
 */
export function doesNotSleep({
    conditionImmunities = [],
    customImmunities = '',
    creatureType = '',
    speciesLabels = []
} = {}) {
    if (conditionImmunities.includes('exhaustion')) return true;
    if (/sleep/i.test(customImmunities)) return true;
    if (NON_SLEEPING_TYPES.has(String(creatureType).toLowerCase())) return true;
    return speciesLabels.some(namesAnElf);
}

/**
 * Flatten a Foundry actor into the descriptor above. Kept beside the predicate so the property
 * paths are covered by the same tests — a wrong path here fails exactly as silently as the bug
 * this replaces.
 *
 * @param {object} actor A dnd5e Actor (or any object with the same shape).
 * @returns {object} descriptor for {@link doesNotSleep}
 */
export function sleepDescriptorFromActor(actor) {
    const traits = actor?.system?.traits ?? {};
    const details = actor?.system?.details ?? {};
    const ci = traits.ci ?? {};
    // `ci.value` is a Set on a live actor and an array in tests/serialised data.
    const conditionImmunities = Array.from(ci.value ?? []);
    // A PC's species lives on a `race` item; an NPC's lives in `details.type.subtype`. NPC subtype
    // is unreliable on its own — the live world has it holding CLASS names ("Cleric", "Wizard") for
    // two of its three drow — but it costs nothing to consult and is the only NPC signal there is.
    const race = actor?.items?.find?.(i => i.type === 'race');
    const speciesLabels = [
        race?.name,
        race?.system?.identifier,
        race?.flags?.ddbimporter?.baseRaceName,
        details.type?.subtype,
        typeof details.race === 'string' ? details.race : details.race?.name,
        // ⚠️ JUDGEMENT CALL, and the one heuristic here that can be WRONG in the permissive
        // direction. For an NPC the statblock name is often the only place the lineage appears at
        // all: live, "Guerriero d'Élite Drow" has no race item, an empty subtype and no custom
        // trait, so without this it sleeps like a human. The cost is that a non-elf whose NAME
        // contains a lineage word — an "Elf Hunter", say — is wrongly made immune. Accepted because
        // the miss is silent and permanent while the false positive is visible on the card (it
        // prints the auto-success reason) and can be corrected by the GM on the spot.
        actor?.name
    ].filter(i => typeof i === 'string' && i);
    return {
        conditionImmunities,
        customImmunities: ci.custom ?? '',
        creatureType: details.type?.value ?? '',
        speciesLabels
    };
}

/**
 * @param {object} actor
 * @returns {boolean} True if Sleep should auto-succeed for this creature.
 */
export function actorDoesNotSleep(actor) {
    return doesNotSleep(sleepDescriptorFromActor(actor));
}
