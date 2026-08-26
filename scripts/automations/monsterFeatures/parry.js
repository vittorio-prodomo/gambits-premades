// ⚠️ FORK-OWNED AUTOMATION (queue T146): the generic monster "Parry" reaction.
//
// MidiQOL already OFFERS a reaction-activation item natively when its holder is hit — the gap
// is that using the bare item does nothing. This automation completes the native flow: when a
// name-matched Parry item is USED as a hit reaction, it applies the item's own AC-bonus roll
// (the utility activity's formula — Sildar's tailored 1d6) as a short-lived AC effect. Midi's
// own post-reaction recompute (Workflow.ts `result?.uuid` branch, the Shield path) then
// re-adjudicates the triggering attack against the raised AC and prints the delta on the card.
//
// Deliberately NAME-matched ("Parry"/"Parata" — Babele can bake the Italian name in as data),
// no flags required: an adventure-compendium re-import rebuilds the item bare and the
// automation stays attached with zero per-actor edits.
//
// ⚠️ The AC effect must NOT carry DAE's `1Reaction` specialDuration — the reaction being
// marked used expires it BEFORE midi's AC recompute runs (cost a live cycle to find). It
// carries seconds:1 instead and is deleted explicitly when the triggering attack completes.
export async function parry({ workflowData }) {
    const workflow = await MidiQOL.Workflow.getWorkflow(`${workflowData}`);
    if (!workflow) return;
    if (!workflow.workflowOptions?.isReaction) return;
    const itemNames = ['parry', 'parata'];
    if (!itemNames.includes(workflow.item?.name?.toLowerCase() ?? '')) return;
    if (workflow.item.type !== 'feat') return;
    const actor = workflow.actor;

    // RAW gates. The triggering attack context rides in workflowOptions.
    const triggerActivity = workflow.workflowOptions.activity;
    if (triggerActivity?.attack?.type?.value !== 'melee') return;
    const wieldsMelee = actor.items.some(i => i.type === 'weapon' && i.system.equipped
        && Array.from(i.system.activities ?? []).some(a => a.actionType === 'mwak'));
    if (!wieldsMelee) return;
    const attackerActor = workflow.workflowOptions.sourceActorUuid ? await fromUuid(workflow.workflowOptions.sourceActorUuid) : null;
    const attackerToken = attackerActor?.getActiveTokens?.()?.[0];
    const holderToken = actor.getActiveTokens?.()?.[0];
    if (attackerToken && holderToken && !MidiQOL.canSee(holderToken, attackerToken)) return;

    // The AC bonus: the item's own utility roll if it fired, else roll its formula now.
    let bonus = workflow.utilityRolls?.[0]?.total;
    if (bonus === undefined) {
        const formula = Array.from(workflow.item.system.activities ?? [])[0]?.roll?.formula || '1d6';
        const rollData = await new CONFIG.Dice.DamageRoll(formula, actor.getRollData()).evaluate();
        await MidiQOL.displayDSNForRoll(rollData, 'damageRoll');
        bonus = rollData.total;
    }

    const [effect] = await actor.createEmbeddedDocuments('ActiveEffect', [{
        name: workflow.item.name,
        img: workflow.item.img,
        origin: workflow.item.uuid,
        duration: { seconds: 1 },
        changes: [{ key: 'system.attributes.ac.bonus', mode: 2, value: '+ ' + bonus, priority: 20 }],
    }]);

    // Remove the effect once the triggering attack finishes (its recompute has consumed it).
    const sourceItemUuid = workflow.workflowOptions.sourceItemUuid;
    const hookId = Hooks.on('midi-qol.RollComplete', async (w) => {
        if (w?.item?.uuid !== sourceItemUuid) return;
        Hooks.off('midi-qol.RollComplete', hookId);
        await effect?.delete()?.catch?.(() => {});
    });
    // Safety net: if the attack workflow never completes, don't leave a stale AC buff.
    setTimeout(async () => {
        Hooks.off('midi-qol.RollComplete', hookId);
        if (actor.effects.get(effect?.id)) await effect.delete().catch(() => {});
    }, 60000);
}
