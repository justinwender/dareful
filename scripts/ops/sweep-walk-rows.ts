/**
 * Removes the questions the development machine's own walks left in production (the final round, 2026-10-09), with
 * everything that hangs off them: their positions, votes, statements, agreements, disputes, close calls, codes,
 * notices, usage rows and the proposals they left; the guests made for them; and the sets made for them, once nothing
 * else is in those. Every one of these was asked by the development account, which is left out of every count, and
 * none is on the chain (checked again here: a question on the chain is never removed, since the chain keeps it).
 *
 * Three batches. The touch-ups round's walk (the Everest argument with its guest's claim and pending proposal, and the
 * two Boone test questions) runs on the owner's go-ahead, given with the final round's brief. The final round's own
 * walk (a game question and a question of one's own on the Rays at Yankees game, the own question's row on that game,
 * the kettle question eight guests joined from the simulators, with those guests, and the unit the walk made on the
 * development account) runs on the go-ahead given with the submission round's brief, and so does the submission
 * round's own walk (the crossword question two guests joined by code and by link, the Bears at Packers game's two
 * questions, the Golden Gate argument with its photo, and the Jonah question a guest joined on production, with those
 * guests, the cover logged for one of them, the photo's two stored files, and the rows the simulators' private tabs
 * left with nothing but their device on them).
 *
 *   npx tsx --env-file=.env.local scripts/ops/sweep-walk-rows.ts                    lists every batch
 *   npx tsx --env-file=.env.local scripts/ops/sweep-walk-rows.ts --apply touch-ups   removes the touch-ups round's
 *   npx tsx --env-file=.env.local scripts/ops/sweep-walk-rows.ts --apply final       removes the final round's
 *   npx tsx --env-file=.env.local scripts/ops/sweep-walk-rows.ts --apply submission  removes the submission round's
 *   npx tsx --env-file=.env.local scripts/ops/sweep-walk-rows.ts --apply ops         removes the ops round's
 *   npx tsx --env-file=.env.local scripts/ops/sweep-walk-rows.ts --apply bug-fixes-1 removes pre-submission bug fixes 1's
 *   npx tsx --env-file=.env.local scripts/ops/sweep-walk-rows.ts --apply bug-fixes-2 removes pre-submission bug fixes 2's
 *   npx tsx --env-file=.env.local scripts/ops/sweep-walk-rows.ts --apply bug-fixes-3 removes pre-submission bug fixes 3's
 *
 * The ops round's walk (the crossword question two guests joined from the simulators, with its drawn photo and the
 * round covered for one of them, the penalty-kick argument one of them took the other side of, and the Bears at
 * Packers game's two questions with the game's photo) is removed the same way once its screenshots are taken.
 *
 * Pre-submission bug fixes 1's walk was made by its own accounts, the nine Dynamic test sign-ins the owner made for it
 * (left out of every count), not the development account: a batch names its askers, the development account unless it
 * says otherwise. The accounts themselves stay, as the owner's.
 *
 * Pre-submission bug fixes 2's walk was four of those accounts handing the phone over on questions they asked, to four
 * stand-in friends made for it as the tests make theirs (`tmp-check:`, left out of every count, with a delegation sealed
 * under a throwaway key so nothing reaches Dynamic): the friends are among the batch's accounts here, so the questions'
 * sets they joined go with the questions, and `npm run test:sweep` removes the friends themselves after.
 *
 * Pre-submission bug fixes 3's walk was one of those accounts making a sticker from a question's photo for the README:
 * the question with its photo, and the two stickers cut from it (`stickers`), each a row of its own with two stored
 * files, removed with the question. A sticker a question or a unit outside the batch still wears is never removed.
 */
import { and, eq, gte, inArray, notInArray, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { frameKey, thumbKey } from "@/lib/media";
import { removeObjects } from "@/lib/media/storage";

/** The development account, whose walks these were. */
const DEV = "7fc0ce05-885a-457b-8a5e-6e8768379cd2";

/**
 * A walk's batch: its questions, any unit it made on the development account, and, for a walk run from private tabs,
 * the moment from which a row carrying nothing but one of the walk's devices is the walk's too (a private tab's device
 * is the walk's own: it is made fresh and thrown away).
 */
type Batch = { key: "touch-ups" | "final" | "submission" | "ops" | "bug-fixes-1" | "bug-fixes-2" | "bug-fixes-3"; name: string; dares: string[]; ownUnits?: string[]; devicesSince?: string; devices?: string[]; askers?: string[]; stickers?: string[] };

/** Pre-submission bug fixes 1's nine test sign-ins (Avery, Blake, Casey, Drew, Ellis, Finn, Greer, Harper, Iris), whose walk it was. */
const BUG_FIXES_1_ACCOUNTS = [
  "ab9ae9d3-20f7-43e9-9842-80263183a103",
  "b6d8695a-17e8-4acd-8536-c86d4b65d207",
  "ad355de5-e506-4462-a27b-10bae28c46b9",
  "1ae23189-dcdb-447e-8004-f9c8d3992d3f",
  "e992765d-21fe-4eb2-b6ba-e064888e61a6",
  "4f44af7b-fdef-428a-82f3-3e2e9e3a2e8f",
  "b47959b1-ba75-4129-952a-f6d9393ffe4b",
  "20ab1bdd-88bc-4174-b487-1ea5a4e1bb80",
  "ec9580c6-d0fe-4e5c-9fe7-dfd6c3cedefc",
];
const BATCHES: Batch[] = [
  {
    key: "touch-ups",
    name: "the touch-ups round's walk (2026-10-08, evening, Eastern): the Everest argument with its guest, and the two Boone questions",
    dares: ["2dd98a50-e299-4af7-b4de-ab68c3dd4627", "d54bd78f-7e78-4d0d-baf8-9fd0e1613621", "dbd4b533-8a64-495e-b07b-71993ecb235d"],
  },
  {
    key: "final",
    name: "the final round's walk (2026-10-09, night, Eastern): the Rays at Yankees game question, the question of one's own on it, and the kettle question the simulators' guests joined",
    dares: ["d14d1832-2841-4e61-ada1-079299654f46", "0d3bff62-c96c-4905-8576-27b203e1069e", "1855a046-3dd7-41f9-8bac-126e28d9a8ec"],
    ownUnits: ["pizzas"],
    devicesSince: "2026-10-08T12:00:00Z",
  },
  {
    key: "submission",
    name: "the submission round's walk (2026-10-09, morning, Eastern): the crossword question, the Bears at Packers game's two questions, the Golden Gate argument with its photo, and the Jonah question a guest joined on production",
    dares: ["6803c0e2-cdbe-40d0-956c-526a1fa217f0", "d2e825e2-7102-4b12-bd84-2fb28939b9ad", "3d3f5288-d25f-4d7a-8398-8125746f16a5", "590c42fa-c285-4c47-bee5-8e731208e625", "ec5a75d3-2f4a-41c3-be07-d6a53218e7c8"],
    devicesSince: "2026-10-09T13:00:00Z",
    // A private tab left open on the crossword question after the first sweep kept reporting its errors until the tabs
    // were closed at 15:33 UTC; the rows that tied that device to the walk were gone by then, so it is named here.
    devices: ["4f9a2121-b4fb-4a06-947d-8fdcaf92a912"],
  },
  {
    key: "ops",
    name: "the ops round's walk (2026-10-09, evening, Eastern): the crossword question two guests joined, with its drawn photo and the round covered for one of them, the penalty-kick argument, and the Bears at Packers game's two questions with the game's photo",
    dares: ["955aa854-be8c-44a1-98f2-5014c59c512b", "d8dd77d2-7afd-469c-9ed7-964f7c7a1978", "26b95658-480a-4068-ba34-a32f0bfa1703", "7f28b265-7138-49b1-aa01-d9e032865dac"],
    devicesSince: "2026-10-09T23:00:00Z",
  },
  {
    key: "bug-fixes-1",
    name: "pre-submission bug fixes 1's walk (2026-10-10, afternoon, Eastern): the Canucks at Devils question three test accounts and a guest joined, and the Boston rain question",
    dares: ["c88a9968-7953-43f8-afd1-ae4e203d758e", "b5f35525-60bf-4c80-a347-ea4972dbc65b"],
    devicesSince: "2026-10-10T14:00:00Z",
    askers: BUG_FIXES_1_ACCOUNTS,
  },
  {
    key: "bug-fixes-2",
    name: "pre-submission bug fixes 2's walk (2026-10-12, evening, Eastern): Ellis's snow question, Greer's ferry question, Finn's bakery question and Iris's band question, each handed over to a stand-in friend",
    dares: ["31645986-b862-4806-8439-08dbce5d61e8", "7230556f-9af6-4ece-ab51-51215367136b", "7ebda1b7-f951-4dc3-9c8b-b26ed1476a44", "66ceb3cd-5c4b-4504-8dd6-80a7b2441f2f"],
    // The four stand-in friends (Wren, Rowan, Sage, Tamsin), temporary accounts the test sweep removes once their questions are gone.
    askers: [...BUG_FIXES_1_ACCOUNTS, "ac6055f1-c2fe-4aed-886b-e8c73cf8e957", "2e015663-d14d-49e8-9444-2a45b3abc8fc", "0dc82ff5-8913-488e-951c-72bf1cca7ec5", "694a92be-222b-42d4-b840-3e32cc872a08"],
  },
  {
    key: "bug-fixes-3",
    name: "pre-submission bug fixes 3's walk (2026-10-12, evening, Eastern): Finn's Lambeau question with the game's photo, and the two stickers cut from it",
    dares: ["c43f02fc-78a8-4c54-9c4c-5ff3858c2eaa"],
    askers: BUG_FIXES_1_ACCOUNTS,
    stickers: ["7fa0abae-2c50-4ac6-89b9-19eb4449b8c3", "e4a78741-7784-4f54-879d-e0d9c822011f"],
  },
];

type Db = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** What a batch would remove, read fresh: its questions, their guests, their sets, and their own questions' rows on a game. */
async function plan(tx: Db, b: Batch) {
  const D = schema.dares;
  const askers = b.askers ?? [DEV];
  const rows = await tx.select({ id: D.id, title: D.title, groupId: D.groupId, creatorId: D.creatorId, onchainId: D.onchainId, templateId: D.templateId }).from(D).where(inArray(D.id, b.dares));
  for (const r of rows) {
    if (!askers.includes(r.creatorId)) throw new Error(`${r.id} was not asked by the walk's own accounts; nothing is removed`);
    if (r.onchainId) throw new Error(`${r.id} is on the chain; nothing is removed`);
  }
  const ids = rows.map((r) => r.id);
  // The guests in them, made by the walk's own accounts, and in nothing else.
  const P = schema.darePositions;
  const guests = ids.length ? (await tx.selectDistinct({ id: P.claimId }).from(P).where(and(inArray(P.dareId, ids), sql`${P.claimId} is not null`))).map((r) => r.id as string) : [];
  const C = schema.participantClaims;
  const ownGuests = guests.length ? (await tx.select({ id: C.id }).from(C).where(and(inArray(C.id, guests), inArray(C.createdBy, askers)))).map((r) => r.id) : [];
  const elsewhere = ownGuests.length ? (await tx.selectDistinct({ id: P.claimId }).from(P).where(and(inArray(P.claimId, ownGuests), notInArray(P.dareId, ids)))).map((r) => r.id as string) : [];
  const claims = ownGuests.filter((c) => !elsewhere.includes(c));
  // Everything proposed with these guests, whatever its origin (a cover logged for one of them included): a guest the
  // walk made has nothing that is not the walk's.
  const OP = schema.obligationProposals;
  const guestProposals = claims.length ? await tx.select({ id: OP.id, groupId: OP.groupId }).from(OP).where(or(inArray(OP.fromClaim, claims), inArray(OP.toClaim, claims))) : [];
  // The sets made for them: nothing else asked in them, nothing owed in them, and nobody in them but the walk's own accounts and these guests.
  const groups: string[] = [];
  for (const g of [...new Set([...rows.map((r) => r.groupId), ...guestProposals.map((r) => r.groupId)])]) {
    const [other] = await tx.select({ n: sql<number>`count(*)::int` }).from(D).where(and(eq(D.groupId, g), notInArray(D.id, ids)));
    const [owed] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.obligations).where(eq(schema.obligations.groupId, g));
    const members = await tx.select({ userId: schema.groupMembers.userId, claimId: schema.groupMembers.claimId }).from(schema.groupMembers).where(eq(schema.groupMembers.groupId, g));
    const onlyUs = members.every((m) => (m.userId !== null && askers.includes(m.userId)) || (m.claimId !== null && claims.includes(m.claimId)));
    const [grp] = await tx.select({ onchainId: schema.groups.onchainId, createdBy: schema.groups.createdBy }).from(schema.groups).where(eq(schema.groups.id, g));
    if ((other?.n ?? 0) === 0 && (owed?.n ?? 0) === 0 && onlyUs && grp && !grp.onchainId && grp.createdBy !== null && askers.includes(grp.createdBy)) groups.push(g);
  }
  // A question of one's own has a row of its own on its game, named for it.
  const ownRows = ids.length ? (await tx.select({ id: schema.publicQuestions.id }).from(schema.publicQuestions).where(or(...ids.map((id) => eq(schema.publicQuestions.key, `own:${id}`))))).map((r) => r.id) : [];
  // The photos' stored files, removed once the rows are gone (the frame and the square, `src/lib/media`).
  const photos = ids.length ? await tx.select({ id: schema.media.id }).from(schema.media).where(inArray(schema.media.dareId, ids)) : [];
  // The stickers the walk cut, the walk's own accounts', worn by nothing outside the batch, with their two stored files each.
  const stickers = b.stickers?.length ? await tx.select({ id: schema.pictureMarks.id, ownerId: schema.pictureMarks.ownerId, sourceKey: schema.pictureMarks.sourceKey, stampKey: schema.pictureMarks.stampKey }).from(schema.pictureMarks).where(inArray(schema.pictureMarks.id, b.stickers)) : [];
  for (const m of stickers) {
    if (!askers.includes(m.ownerId)) throw new Error(`sticker ${m.id} is not the walk's own; nothing is removed`);
    const [worn] = await tx.select({ n: sql<number>`count(*)::int` }).from(D).where(and(eq(D.markValue, m.id), sql`${D.markKind} in ('sticker', 'image')`, ids.length ? notInArray(D.id, ids) : undefined));
    const [unit] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.denominations).where(and(eq(schema.denominations.markValue, m.id), eq(schema.denominations.markKind, "image")));
    if ((worn?.n ?? 0) > 0 || (unit?.n ?? 0) > 0) throw new Error(`sticker ${m.id} is still worn; nothing is removed`);
  }
  const objects = [...photos.flatMap((m) => [frameKey(m.id), thumbKey(m.id)]), ...stickers.flatMap((m) => [m.sourceKey, m.stampKey])];
  // The rows a walk's private tabs left with nothing on them but their device: an error shown, a game's link opened.
  const U = schema.usageEvents;
  let deviceRows: string[] = [];
  if (b.devicesSince) {
    const seen =
      ids.length || claims.length
        ? await tx
            .selectDistinct({ device: U.deviceId })
            .from(U)
            .where(and(sql`${U.deviceId} is not null`, or(ids.length ? inArray(U.dareId, ids) : undefined, claims.length ? inArray(U.claimId, claims) : undefined)))
        : [];
    const devices = [...new Set([...seen.map((r) => r.device as string), ...(b.devices ?? [])])];
    if (devices.length)
      deviceRows = (
        await tx
          .select({ id: U.id })
          .from(U)
          .where(and(inArray(U.deviceId, devices), sql`${U.dareId} is null`, sql`${U.claimId} is null`, sql`${U.userId} is null`, gte(U.at, new Date(b.devicesSince))))
      ).map((r) => r.id);
  }
  return { rows, ids, claims, groups, ownRows, guestProposals: guestProposals.map((r) => r.id), objects, deviceRows, stickers: stickers.map((m) => m.id) };
}

async function remove(tx: Db, p: Awaited<ReturnType<typeof plan>>) {
  const { ids, claims, groups, ownRows, guestProposals, deviceRows, stickers } = p;
  if (ids.length) {
    await tx.delete(schema.notificationLog).where(inArray(schema.notificationLog.dareId, ids));
    await tx.delete(schema.roomCodes).where(inArray(schema.roomCodes.dareId, ids));
    await tx.delete(schema.personalLinks).where(inArray(schema.personalLinks.dareId, ids));
    await tx.delete(schema.nowArchive).where(inArray(schema.nowArchive.dareId, ids));
    await tx.delete(schema.dareNumberSeries).where(inArray(schema.dareNumberSeries.dareId, ids));
    await tx.delete(schema.media).where(inArray(schema.media.dareId, ids));
    await tx.delete(schema.dareVotes).where(inArray(schema.dareVotes.dareId, ids));
    await tx.delete(schema.dareCloseCalls).where(inArray(schema.dareCloseCalls.dareId, ids));
    await tx.delete(schema.dareStatements).where(inArray(schema.dareStatements.dareId, ids));
    await tx.delete(schema.dareAgreements).where(inArray(schema.dareAgreements.dareId, ids));
    await tx.delete(schema.dareDisputes).where(inArray(schema.dareDisputes.dareId, ids));
    await tx.delete(schema.usageEvents).where(inArray(schema.usageEvents.dareId, ids));
    await tx.delete(schema.darePositions).where(inArray(schema.darePositions.dareId, ids));
    await tx.delete(schema.obligationProposals).where(and(eq(schema.obligationProposals.origin, "dare"), inArray(schema.obligationProposals.originId, ids)));
    await tx.delete(schema.dares).where(inArray(schema.dares.id, ids));
  }
  if (ownRows.length) await tx.delete(schema.publicQuestions).where(inArray(schema.publicQuestions.id, ownRows));
  if (stickers.length) await tx.delete(schema.pictureMarks).where(inArray(schema.pictureMarks.id, stickers));
  if (guestProposals.length) await tx.delete(schema.obligationProposals).where(inArray(schema.obligationProposals.id, guestProposals));
  if (deviceRows.length) await tx.delete(schema.usageEvents).where(inArray(schema.usageEvents.id, deviceRows));
  if (claims.length) {
    await tx.delete(schema.usageEvents).where(inArray(schema.usageEvents.claimId, claims));
    await tx.delete(schema.claimNumberAttempts).where(inArray(schema.claimNumberAttempts.claimId, claims));
    await tx.delete(schema.claimTokens).where(inArray(schema.claimTokens.claimId, claims));
    await tx.delete(schema.claimLinks).where(inArray(schema.claimLinks.claimId, claims));
    await tx.delete(schema.personalLinks).where(inArray(schema.personalLinks.claimId, claims));
    await tx.delete(schema.groupMembers).where(inArray(schema.groupMembers.claimId, claims));
    await tx.delete(schema.participantClaims).where(inArray(schema.participantClaims.id, claims));
  }
  if (groups.length) {
    await tx.delete(schema.groupInvites).where(inArray(schema.groupInvites.groupId, groups));
    await tx.delete(schema.groupMembers).where(inArray(schema.groupMembers.groupId, groups));
    await tx.delete(schema.denominations).where(inArray(schema.denominations.groupId, groups));
    await tx.delete(schema.groups).where(inArray(schema.groups.id, groups));
  }
}

async function main() {
  const apply = process.argv.indexOf("--apply");
  const which = apply >= 0 ? process.argv[apply + 1] : null;
  for (const b of BATCHES) {
    const p = await plan(db, b);
    console.log(`${b.name}:`);
    for (const r of p.rows) console.log(`  question ${r.id.slice(0, 8)} "${r.title}"`);
    console.log(
      `  ${p.claims.length} guest(s), ${p.guestProposals.length} proposal(s) with them, ${p.groups.length} set(s), ${p.ownRows.length} own question row(s), ${p.stickers.length} sticker(s), ${p.objects.length} stored photo and sticker file(s), ${p.deviceRows.length} device-only usage row(s)${b.ownUnits ? `, and the unit(s) ${b.ownUnits.join(", ")} on the development account` : ""}`,
    );
    if (which !== b.key) continue;
    let objects: string[] = [];
    await db.transaction(async (tx) => {
      const fresh = await plan(tx, b);
      objects = fresh.objects;
      await remove(tx, fresh);
      if (b.ownUnits?.length) {
        const [me] = await tx.select({ ownUnits: schema.users.ownUnits }).from(schema.users).where(eq(schema.users.id, DEV));
        await tx.update(schema.users).set({ ownUnits: (me?.ownUnits ?? []).filter((u) => !b.ownUnits?.includes(u)) }).where(eq(schema.users.id, DEV));
      }
    });
    // The files go once the rows that pointed at them are gone, so nothing can be served without its file.
    await removeObjects(objects);
    console.log("  removed");
  }
  process.exit(0);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message.split("\n")[0] : "failed");
  process.exit(1);
});
