import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * CPR's versionCheck (chris-premades/scripts/extensions/requirements.js) compares a sheet
 * item's `flags.chris-premades.info.version` (copied from our pack document) with the GPS
 * registry version CPR builds from the pack index's `system.source.custom`. When the two
 * differ in the pack document itself, EVERY fresh copy is "out of date" and CPR ABORTS the
 * midi workflow at preItemRoll — no saves, no effects, one whispered card. Upstream 2.1.44
 * shipped Sleep that way (source bumped, info flag not), and 14 other documents had carried
 * the same mismatch for longer. This test keeps every pack document self-consistent so a
 * future upstream merge cannot reintroduce the silent kill.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../packData');

test('every packData document has chris-premades.info.version === system.source.custom', () => {
    const bad = [];
    for (const pack of fs.readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory())) {
        for (const f of fs.readdirSync(path.join(root, pack.name)).filter(f => f.endsWith('.json'))) {
            let doc;
            try { doc = JSON.parse(fs.readFileSync(path.join(root, pack.name, f), 'utf8')); } catch { continue; }
            const source = doc?.system?.source?.custom;
            const info = doc?.flags?.['chris-premades']?.info?.version;
            if (source && info && source !== info) bad.push(`${pack.name}/${f}: source ${source} vs info ${info}`);
        }
    }
    assert.deepEqual(bad, []);
});
