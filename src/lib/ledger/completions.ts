/**
 * What finishes each kind of chain write once its receipt is in, for a send whose receipt outlived the request
 * (docs/decisions.md 2026-09-27, "a send is never lost"): the same mirror the action writes inline, from the
 * subject the write was recorded with. Each is idempotent, so running it after the action already ran it changes
 * nothing. A settlement's mirror comes from the indexer, which may lag a minute behind the receipt: false then,
 * and the tick asks again.
 */
import type { Hex } from "viem";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Completions } from "@/lib/chain/reconcile";
import { completeClose } from "./closes";
import { completeLock, marketById, reconcileFromIndexer } from "./markets";
import { completeConfirm } from "./proposals";
import { ensureDenomOnchain, ensureGroupOnchain, mirrorRegistration } from "./registry";
import { completeExpire } from "./settle";

const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

export const completions: Completions = {
  confirm: async (subject, receipt) => {
    const ids = Array.isArray(subject.proposalIds) ? subject.proposalIds.filter((x): x is string => typeof x === "string") : [];
    return ids.length > 0 ? completeConfirm(ids, receipt.hash) : true;
  },
  close: async (subject) => {
    const id = str(subject.obligationId);
    return id ? completeClose(id) : true;
  },
  net: async () => true,
  create: async (subject, receipt) => {
    const id = str(subject.dareId);
    const d = id ? await marketById(id) : null;
    if (!d) return true;
    await completeLock(d, receipt.blockNumber);
    return true;
  },
  resolve: async (subject) => {
    const id = str(subject.dareId);
    return id ? reconcileFromIndexer(id, { by: "quorum" }) : true;
  },
  arbitrate: async (subject) => {
    const id = str(subject.dareId);
    // The app's own ruling standing is recorded through `arbitrate` too (the touch-ups round); its subject says so.
    return id ? reconcileFromIndexer(id, { by: subject.by === "ruling" ? "ruling" : "arbitration", rulingText: str(subject.rulingText) ?? undefined, rulingHash: (str(subject.rulingHash) as Hex | null) ?? undefined }) : true;
  },
  feed: async (subject) => {
    const id = str(subject.dareId);
    if (!id) return true;
    const done = await reconcileFromIndexer(id, { by: "feed", rulingText: str(subject.rulingText) ?? undefined, rulingHash: (str(subject.rulingHash) as Hex | null) ?? undefined });
    const ending = str(subject.ending);
    if (done && ending) await db.update(schema.dares).set({ feedEnding: ending }).where(eq(schema.dares.id, id));
    return done;
  },
  expire: async (subject) => {
    const id = str(subject.dareId);
    return id ? completeExpire(id) : true;
  },
  register: async (subject) => {
    // A question's own group (the games-and-the-reveal round) has nothing offchain to mirror: its lock reads the chain
    // again when it runs, from the next tap or the tick, and finishes or adds whoever is missing then.
    if (str(subject.questionId)) return true;
    const groupId = str(subject.groupId);
    const denomId = str(subject.denomId);
    // The people the registration was for (the second-pass round). A write the earlier build left in flight names
    // the set alone: its own transaction carries its members, so finishing it registers nobody new here.
    const userIds = Array.isArray(subject.userIds) ? subject.userIds.filter((x): x is string => typeof x === "string") : [];
    if (userIds.length === 0) return mirrorRegistration({ groupId, denomId });
    if (denomId) await ensureDenomOnchain(denomId, userIds);
    else if (groupId) await ensureGroupOnchain(groupId, userIds);
    return true;
  },
  other: async () => true,
};
