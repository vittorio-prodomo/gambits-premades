import test from "node:test";
import assert from "node:assert";
import { oaRegionIdsForToken, orphanedOaRegionIds, isOaRegionUsable } from "./oaRegionCleanup.mjs";

const NS = "gambits-premades";
const region = (id, { actorUuid = null, tokenUuid = null } = {}) => ({
    id,
    flags: { [NS]: { actorUuid, tokenUuid } }
});

// --- deleting a token must take its OA region with it (the root cause of T194) ---

test("returns the regions stamped for the deleted token", () => {
    const regions = [
        region("a", { tokenUuid: "Scene.S.Token.T1" }),
        region("b", { tokenUuid: "Scene.S.Token.T2" }),
        region("c", { tokenUuid: "Scene.S.Token.T1" })
    ];
    assert.deepEqual(oaRegionIdsForToken(regions, "Scene.S.Token.T1"), ["a", "c"]);
});

test("a token with no OA region yields nothing", () => {
    assert.deepEqual(oaRegionIdsForToken([region("a", { tokenUuid: "Scene.S.Token.T1" })], "Scene.S.Token.T9"), []);
});

test("ignores regions that are not ours", () => {
    const foreign = { id: "x", flags: {} };
    assert.deepEqual(oaRegionIdsForToken([foreign], "Scene.S.Token.T1"), []);
});

test("never matches on a null/undefined uuid — that would delete every unstamped region", () => {
    const regions = [region("a", { tokenUuid: null }), { id: "b", flags: {} }];
    assert.deepEqual(oaRegionIdsForToken(regions, null), []);
    assert.deepEqual(oaRegionIdsForToken(regions, undefined), []);
});

// --- sweeping regions already orphaned by the bug ---

test("an orphan is a region whose stamped actor no longer resolves", () => {
    const regions = [
        region("live", { actorUuid: "Actor.OK", tokenUuid: "Scene.S.Token.OK" }),
        region("dead", { actorUuid: "Scene.S.Token.GONE.Actor.X", tokenUuid: "Scene.S.Token.GONE" })
    ];
    const resolve = (uuid) => (uuid.includes("GONE") ? null : {});
    assert.deepEqual(orphanedOaRegionIds(regions, resolve), ["dead"]);
});

test("a live actor whose TOKEN is gone is still an orphan", () => {
    // the linked-PC shape: actorUuid is a world Actor. uuid and survives, but the
    // region is still dead weight and its token-side reads blow up downstream
    const regions = [region("halfDead", { actorUuid: "Actor.LinkedPC", tokenUuid: "Scene.S.Token.GONE" })];
    const resolve = (uuid) => (uuid.includes("GONE") ? null : {});
    assert.deepEqual(orphanedOaRegionIds(regions, resolve), ["halfDead"]);
});

test("a region missing our flags is not swept — it is not ours to delete", () => {
    assert.deepEqual(orphanedOaRegionIds([{ id: "x", flags: {} }], () => null), []);
});

// --- the guard at the throw site ---

test("an OA event is only usable when both actor and token resolved", () => {
    assert.equal(isOaRegionUsable({ actor: {}, token: {} }), true);
    assert.equal(isOaRegionUsable({ actor: null, token: {} }), false);
    assert.equal(isOaRegionUsable({ actor: {}, token: null }), false);
    assert.equal(isOaRegionUsable({ actor: null, token: null }), false);
});
