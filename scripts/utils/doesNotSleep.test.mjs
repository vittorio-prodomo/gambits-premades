import test from 'node:test';
import assert from 'node:assert/strict';
import { doesNotSleep, namesAnElf, sleepDescriptorFromActor, actorDoesNotSleep } from './doesNotSleep.mjs';

/* The regression this whole file exists for. */
test('the party\'s real trait value is recognised — ";Sleep", not "Magical Sleep"', () => {
    // Verified live 2026-08-02 on Warpey and Nahuel. The T116 check was
    // `.includes("Magical Sleep")`, which is false for this string, so the limb never fired.
    assert.equal(doesNotSleep({customImmunities: ';Sleep'}), true);
});

test('a GM typing it by hand is recognised too, in either wording', () => {
    for (const custom of ['Magical Sleep', 'sleep', 'Sleep;Petrified', 'Immune to magical sleep']) {
        assert.equal(doesNotSleep({customImmunities: custom}), true, custom);
    }
});

test('an unrelated custom immunity does not grant it', () => {
    assert.equal(doesNotSleep({customImmunities: ';Petrified'}), false);
    assert.equal(doesNotSleep({customImmunities: ''}), false);
});

test('exhaustion immunity auto-succeeds, as the spell text says outright', () => {
    assert.equal(doesNotSleep({conditionImmunities: ['exhaustion']}), true);
    assert.equal(doesNotSleep({conditionImmunities: ['charmed']}), false);
});

test('Undead and Constructs do not sleep (Vittorio 2026-08-02)', () => {
    assert.equal(doesNotSleep({creatureType: 'undead'}), true);
    assert.equal(doesNotSleep({creatureType: 'construct'}), true);
    assert.equal(doesNotSleep({creatureType: 'Undead'}), true, 'type casing varies by source');
    for (const t of ['humanoid', 'beast', 'fiend', 'fey', 'aberration', 'dragon', '']) {
        assert.equal(doesNotSleep({creatureType: t}), false, t);
    }
});

test('elf lineages are recognised from any species label', () => {
    // These are the live values: identifiers `wood-elf` / `elf-drow`, race names `Wood Elf` /
    // `Elf (Drow)`, ddbimporter baseRaceName `Elf`, NPC subtype `Elf`.
    for (const label of ['Elf', 'wood-elf', 'Wood Elf', 'elf-drow', 'Elf (Drow)', 'Drow', 'high-elf', 'Eladrin']) {
        assert.equal(namesAnElf(label), true, label);
    }
});

test('⚠️ startsWith("elf") is NOT enough — wood-elf is the counterexample', () => {
    assert.equal('wood-elf'.startsWith('elf'), false);
    assert.equal(namesAnElf('wood-elf'), true);
});

test('an Italian NPC name still resolves, because the lineage word survives translation', () => {
    // Live NPC: "Guerriero d'Élite Drow" — subtype empty, so the name is the only signal.
    assert.equal(namesAnElf("Guerriero d'Élite Drow"), true);
});

test('the actor NAME is consulted, because for an NPC it is often the only lineage signal', () => {
    /*
     * ⚠️ Regression guard for a real miss. The predicate passed on the string
     * "Guerriero d'Élite Drow" while the live actor still returned false, because the extractor
     * never put the name in speciesLabels — it read the race item, the subtype and details.race,
     * all empty for that NPC. Testing namesAnElf() directly proved nothing about the path that
     * actually runs. This asserts the ACTOR shape, not the string.
     */
    const drowWarrior = {
        name: "Guerriero d'Élite Drow",
        system: {traits: {ci: {value: new Set(), custom: ''}},
                 details: {type: {value: 'humanoid', subtype: ''}}},
        items: []
    };
    assert.ok(sleepDescriptorFromActor(drowWarrior).speciesLabels.includes("Guerriero d'Élite Drow"));
    assert.equal(actorDoesNotSleep(drowWarrior), true);
});

test('⚠️ the name heuristic is permissive — a non-elf named for elves is wrongly covered', () => {
    /*
     * Documented, not fixed. Accepted trade (2026-08-02): an NPC's name is frequently the only
     * place its lineage appears, and the failure is visible — the card prints the auto-success
     * reason, so a GM sees it and can correct it. Pinning it here means the trade is a decision
     * someone made rather than something nobody noticed.
     */
    const elfHunter = {
        name: 'Elf Hunter',
        system: {traits: {ci: {value: new Set(), custom: ''}}, details: {type: {value: 'humanoid'}}},
        items: []
    };
    assert.equal(actorDoesNotSleep(elfHunter), true, 'if this ever fails, the heuristic was tightened — update the note');
    // The near-miss that must NOT trigger: "elf" inside a longer word has no word boundary.
    const elfrida = {
        name: 'Elfrida the Bold',
        system: {traits: {ci: {value: new Set(), custom: ''}}, details: {type: {value: 'humanoid'}}},
        items: []
    };
    assert.equal(actorDoesNotSleep(elfrida), false);
});

test('⚠️ a Half-Elf sleeps — Fey Ancestry never carried the sleep clause for them', () => {
    // `\belf\b` matches "half-elf" because the hyphen is a word boundary, so this needs its own
    // rejection. Getting it wrong makes a Half-Elf silently immune.
    for (const label of ['Half-Elf', 'half-elf', 'Half Elf', 'halfElf'.replace('E', '-E')]) {
        assert.equal(namesAnElf(label), false, label);
    }
    assert.equal(doesNotSleep({speciesLabels: ['Half-Elf', 'half-elf']}), false);
});

test('non-elf species do not qualify', () => {
    for (const label of ['Human', 'Orc', 'orc', 'Dwarf', 'Goblinoid', 'Cleric', 'Wizard', '']) {
        assert.equal(namesAnElf(label), false, label);
    }
});

test('the descriptor reads a live PC shape — Set-valued ci, race item, ddb flag', () => {
    const warpey = {
        system: {
            traits: {ci: {value: new Set(), custom: ';Sleep'}},
            details: {type: {value: 'humanoid', subtype: null}, race: {name: 'Wood Elf'}}
        },
        items: [
            {type: 'class', name: 'Ranger'},
            {type: 'race', name: 'Wood Elf', system: {identifier: 'wood-elf'},
             flags: {ddbimporter: {baseRaceName: 'Elf'}}}
        ]
    };
    const d = sleepDescriptorFromActor(warpey);
    assert.deepEqual(d.conditionImmunities, []);
    assert.equal(d.customImmunities, ';Sleep');
    assert.equal(d.creatureType, 'humanoid');
    assert.ok(d.speciesLabels.includes('wood-elf'));
    assert.ok(d.speciesLabels.includes('Elf'));
    assert.equal(actorDoesNotSleep(warpey), true);
});

test('an elf PC still qualifies via species alone if the custom trait is ever lost', () => {
    // The trait is generated from an English, curly-apostrophe sentence in Trance's description,
    // so a reworded or translated sheet drops it. The species limb is the safety net.
    const elf = {
        system: {traits: {ci: {value: new Set(), custom: ''}}, details: {type: {value: 'humanoid'}}},
        items: [{type: 'race', name: 'Elf (Drow)', system: {identifier: 'elf-drow'}, flags: {}}]
    };
    assert.equal(actorDoesNotSleep(elf), true);
});

test('an NPC elf is reached through details.type.subtype, its only signal', () => {
    // Live: "Nezznar il Ragno" is humanoid/Elf with no race item and no custom traits.
    const nezznar = {
        system: {traits: {ci: {value: new Set(), custom: ''}},
                 details: {type: {value: 'humanoid', subtype: 'Elf'}}},
        items: []
    };
    assert.equal(actorDoesNotSleep(nezznar), true);
});

test('an ordinary humanoid NPC is still put to sleep', () => {
    const goblin = {
        system: {traits: {ci: {value: new Set(), custom: ''}},
                 details: {type: {value: 'humanoid', subtype: 'Goblinoid'}}},
        items: []
    };
    assert.equal(actorDoesNotSleep(goblin), false);
});

test('a skeleton qualifies on creature type with nothing else declared', () => {
    const skeleton = {
        system: {traits: {ci: {value: new Set(['poisoned']), custom: ''},},
                 details: {type: {value: 'undead', subtype: ''}}},
        items: []
    };
    assert.equal(actorDoesNotSleep(skeleton), true);
});

test('a malformed or partial actor returns false rather than throwing', () => {
    // This runs inside a midi pass mid-workflow; a throw here would strand the save resolution.
    for (const actor of [undefined, null, {}, {system: {}}, {system: {traits: {}, details: {}}}]) {
        assert.equal(actorDoesNotSleep(actor), false);
    }
});
