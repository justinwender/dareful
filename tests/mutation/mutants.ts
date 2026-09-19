/**
 * One deliberate break per rule. `find` must occur exactly once in `file` (or say which with `nth`); `kills`
 * names every test that must fail while the break is in place. See run.ts.
 */
export type Edit = { file: string; find: string; replace: string; nth?: number };
export type Mutant = Edit & { id: string; suite: string; kills: string[]; why: string; also?: Edit[] };

const PHONE = "src/lib/auth/phone.ts";
const JWT = "src/lib/auth/jwt.ts";
const TOKENS = "src/lib/ledger/tokens.ts";
const COPY = "src/lib/ui/copy.ts";
const GROUPS = "src/lib/ledger/groups.ts";
const U_PHONE = "tests/unit/phone.test.ts";
const U_TOKENS = "tests/unit/tokens.test.ts";
const U_COPY = "tests/unit/copy.test.ts";
const D_INVITES = "tests/db/invites.test.ts";

const unit: Mutant[] = [
  {
    id: "phone-strip-digits",
    file: PHONE,
    find: "return parsed.number;",
    replace: 'return "+" + raw.replace(/[^\\d]/g, "");',
    suite: U_PHONE,
    kills: ["seven US spellings of one number give one hash", "a national-format contact normalizes with its country code", "the login hash equals the saved-contact hash", "UK national and international spellings agree in region GB"],
    why: "the first-half bug: digits stripped, country code lost",
  },
  {
    id: "phone-login-drops-country-code",
    file: JWT,
    find: "for (const candidate of [`+${code}${digits}`, `+${digits}`]) {",
    replace: "for (const candidate of [`+${digits}`]) {",
    suite: U_PHONE,
    kills: ["a US login normalizes to E.164", "a UK login matches them"],
    why: "a login's country code is ignored",
  },
  {
    id: "phone-login-guesses-shared-prefix",
    file: JWT,
    find: "for (const candidate of [`+${code}${digits}`, `+${digits}`]) {",
    replace: 'for (const candidate of [`+${digits.startsWith(code) ? "" : code}${digits}`]) {',
    suite: U_PHONE,
    kills: ["a +7 number whose national part starts with 7 keeps its country code"],
    why: "the old prefix guess: a national number starting with the code's digits loses the code",
  },
  { id: "phone-unsalted", file: PHONE, find: 'createHmac("sha256", salt)', replace: 'createHmac("sha256", "fixed")', suite: U_PHONE, kills: ["the hash is keyed by the salt"], why: "the salt is not used" },
  { id: "phone-constant-hash", file: PHONE, find: ".update(normalizeE164(raw, defaultRegion))", replace: '.update("x")', suite: U_PHONE, kills: ["two different numbers hash differently"], why: "every number hashes the same" },
  {
    id: "phone-region-ignored",
    file: PHONE,
    find: "parsePhoneNumberFromString(raw, region)",
    replace: 'parsePhoneNumberFromString(raw, "US")',
    suite: U_PHONE,
    kills: ["the same national digits read differently in different regions", "a national number with no region does not hash as something", "UK national and international spellings agree in region GB"],
    why: "every national number is read as American",
  },
  {
    id: "phone-garbage-hashes",
    file: PHONE,
    find: "  } catch {\n    return null;\n  }",
    replace: "  } catch {\n    return Buffer.alloc(32);\n  }",
    suite: U_PHONE,
    kills: ["garbage does not hash", "a national number with no region does not hash as something"],
    why: "unparseable input hashes as something",
  },
  { id: "phone-invented-credential", file: JWT, find: "if (!c?.phone_number) return undefined;", replace: 'if (!c?.phone_number) return "+12125550142";', suite: U_PHONE, kills: ["a login with no phone credential yields nothing"], why: "a login with no phone is given one" },
  { id: "phone-default-region", file: PHONE, find: 'country.toUpperCase() : "US";', replace: 'country : "GB";', suite: U_PHONE, kills: ["the default region comes from the platform header, US when absent"], why: "wrong default region and no case folding" },

  { id: "token-short", file: TOKENS, find: "const TOKEN_BYTES = 32;", replace: "const TOKEN_BYTES = 16;", suite: U_TOKENS, kills: ["a token is 32 random bytes as base64url"], why: "half the entropy" },
  { id: "token-wrong-digest", file: TOKENS, find: 'createHash("sha256")', replace: 'createHash("sha1")', suite: U_TOKENS, kills: ["only the sha256 of a token is what gets stored"], why: "not sha256" },
  { id: "token-any-shape", file: TOKENS, find: "if (!TOKEN_PATTERN.test(token)) return null;", replace: "", suite: U_TOKENS, kills: ["anything not shaped like a token never reaches a query"], why: "malformed strings are hashed and queried" },

  {
    id: "when-yesterday-by-hours",
    file: COPY,
    find: "const days = dayNumber(now, timeZone) - dayNumber(at, timeZone);",
    replace: "const days = Math.floor(ms / 86_400_000);",
    suite: U_COPY,
    kills: ["something from last night reads as yesterday, not as a weekday two days back"],
    why: "the original bug: days counted in 24-hour spans, not calendar days",
  },
  { id: "when-yesterday-only-within-a-day", file: COPY, find: 'if (days === 1) return "yesterday";', replace: 'if (days === 1 && ms < 86_400_000) return "yesterday";', suite: U_COPY, kills: ["thirty hours ago is yesterday when it was yesterday, even though it is more than a day"], why: "yesterday capped at 24 hours" },
  {
    id: "when-days-in-one-zone",
    file: COPY,
    find: 'new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric"',
    replace: 'new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric"',
    suite: U_COPY,
    kills: ["the same two instants read differently in a zone where no midnight fell between them"],
    why: "calendar days computed in a fixed zone, which is what the server's zone is",
  },
  { id: "when-weekday-in-utc", file: COPY, find: '{ timeZone, weekday: "long" }', replace: '{ timeZone: "UTC", weekday: "long" }', suite: U_COPY, kills: ["two calendar days back reads as the weekday in the viewer's zone"], why: "weekday named in UTC" },
  { id: "when-no-just-now", file: COPY, find: 'if (ms < 60_000) return "just now";', replace: "", suite: U_COPY, kills: ["minutes, and just now"], why: "no just-now" },
  {
    id: "when-minutes-lose-to-midnight",
    file: COPY,
    find: "if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} min ago`;",
    replace: "if (ms < 3_600_000 && dayNumber(now, timeZone) === dayNumber(at, timeZone)) return `${Math.floor(ms / 60_000)} min ago`;",
    suite: U_COPY,
    kills: ["forty minutes ago across midnight is still minutes"],
    why: "forty minutes ago reads as yesterday after midnight",
  },
  { id: "when-date-in-utc", file: COPY, find: 'toLocaleDateString("en-US", { timeZone, weekday: "short"', replace: 'toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short"', suite: U_COPY, kills: ["a week or more back is a date in the viewer's zone"], why: "absolute dates in UTC" },
  { id: "day-label-in-utc", file: COPY, find: '{ timeZone, month: "short", day: "numeric" }', replace: '{ timeZone: "UTC", month: "short", day: "numeric" }', suite: U_COPY, kills: ["a day label is in the viewer's zone"], why: "day label in UTC" },
  { id: "zone-unvalidated", file: COPY, find: "  } catch {\n    return null;\n  }", replace: "  } catch {\n    return zone;\n  }", suite: U_COPY, kills: ["a zone from a cookie is validated before it is used"], why: "a bad cookie value is used as a zone" },
  { id: "first-name-is-full-name", file: COPY, find: 'return displayName.trim().split(/\\s+/)[0] ?? "";', replace: "return displayName.trim();", suite: U_COPY, kills: ["a first name is the first word only"], why: "full display name" },
];

const LIVE = "isNull(schema.groupInvites.revokedAt), gt(schema.groupInvites.expiresAt, new Date())";
const invites: Mutant[] = [
  { id: "invite-never-reads", file: GROUPS, find: "  return row ?? null;\n}\n\n/** Links that still work", replace: "  return null;\n}\n\n/** Links that still work", suite: D_INVITES, kills: ["a member can make a link, and it reads as live"], why: "a live link reads as nothing" },
  { id: "invite-anyone-makes", file: GROUPS, find: 'if (!(await isMember(groupId, createdBy))) throw new Error("only someone in the group can make a link");', replace: "", suite: D_INVITES, kills: ["a non-member cannot make a link"], why: "no membership check on making a link" },
  { id: "invite-double-counts", file: GROUPS, find: "${schema.groupInvites.useCount} + 1", replace: "${schema.groupInvites.useCount} + 2", suite: D_INVITES, kills: ["redeeming joins the group and counts once", "a live link is listed with its count and its maker"], why: "a join counts twice" },
  { id: "invite-joins-nobody", file: GROUPS, find: "      await tx.insert(schema.groupMembers).values({ groupId: group.id, userId });", replace: "", suite: D_INVITES, kills: ["redeeming joins the group and counts once"], why: "redeeming counts a use and seats nobody" },
  { id: "invite-retap-counts", file: GROUPS, find: "    if (existing && existing.leftAt === null) return group;", replace: "", suite: D_INVITES, kills: ["an existing member tapping the link again is not a use"], why: "every tap is a use" },
  { id: "invite-no-row-lock", file: GROUPS, find: '      .limit(1)\n      .for("update");\n    if (!invite) return null;', replace: "      .limit(1);\n    if (!invite) return null;", suite: D_INVITES, kills: ["two concurrent redemptions by one person count once"], why: "the invite row is not locked, so parallel redemptions race" },
  { id: "invite-malformed-throws", file: GROUPS, find: "  if (!tokenHash) return null;\n  return db.transaction(", replace: '  if (!tokenHash) throw new Error("bad token");\n  return db.transaction(', suite: D_INVITES, kills: ["a malformed token, and the old signed-token shape, read as nothing"], why: "a malformed link is an error with a reason instead of nothing" },
  { id: "invite-wrong-maker", file: GROUPS, find: "    createdBy: r.createdBy,\n", replace: "    createdBy: r.createdByName,\n", suite: D_INVITES, kills: ["a live link is listed with its count and its maker"], why: "wrong maker listed" },
  { id: "invite-anyone-revokes", file: GROUPS, find: 'if (!(await isMember(groupId, userId))) throw new Error("only someone in the group can turn off a link");', replace: "", suite: D_INVITES, kills: ["a non-member cannot turn a link off, and it still works afterwards"], why: "no membership check on revoking" },
  { id: "invite-revoke-does-nothing", file: GROUPS, find: ".set({ revokedAt: new Date() })", replace: ".set({ revokedAt: null })", suite: D_INVITES, kills: ["a member who did not make a link can turn it off, and then it joins no one and is not listed"], why: "revoking changes nothing" },
  { id: "invite-revoked-still-reads", file: GROUPS, find: LIVE, nth: 1, replace: "gt(schema.groupInvites.expiresAt, new Date())", suite: D_INVITES, kills: ["a member who did not make a link can turn it off, and then it joins no one and is not listed"], why: "a revoked link still reads as live" },
  { id: "invite-revoked-still-listed", file: GROUPS, find: LIVE, nth: 2, replace: "gt(schema.groupInvites.expiresAt, new Date())", suite: D_INVITES, kills: ["a member who did not make a link can turn it off, and then it joins no one and is not listed"], why: "a revoked link is still listed" },
  { id: "invite-revoked-still-joins", file: GROUPS, find: LIVE, nth: 3, replace: "gt(schema.groupInvites.expiresAt, new Date())", suite: D_INVITES, kills: ["a member who did not make a link can turn it off, and then it joins no one and is not listed"], why: "a revoked link still joins people" },
  { id: "invite-expired-still-reads", file: GROUPS, find: LIVE, nth: 1, replace: "isNull(schema.groupInvites.revokedAt)", suite: D_INVITES, kills: ["an expired link reads as nothing, joins no one, and is not listed"], why: "an expired link still reads as live" },
  { id: "invite-expired-still-listed", file: GROUPS, find: LIVE, nth: 2, replace: "isNull(schema.groupInvites.revokedAt)", suite: D_INVITES, kills: ["an expired link reads as nothing, joins no one, and is not listed"], why: "an expired link is still listed" },
  { id: "invite-expired-still-joins", file: GROUPS, find: LIVE, nth: 3, replace: "isNull(schema.groupInvites.revokedAt)", suite: D_INVITES, kills: ["an expired link reads as nothing, joins no one, and is not listed"], why: "an expired link still joins people" },
  { id: "invite-thirty-days", file: GROUPS, find: "const INVITE_DAYS = 14;", replace: "const INVITE_DAYS = 30;", suite: D_INVITES, kills: ["a new link is good for fourteen days"], why: "wrong expiry" },
  { id: "invite-dyad-joinable", file: GROUPS, find: 'if (!group || group.isDyad) throw new Error("that group cannot be joined by link");', replace: 'if (!group) throw new Error("that group cannot be joined by link");', suite: D_INVITES, kills: ["a dyad cannot be joined by link"], why: "a dyad can be given a link" },
  { id: "invite-stores-the-token", file: GROUPS, find: "values({ tokenHash, groupId, createdBy, expiresAt })", replace: "values({ tokenHash: Buffer.from(token), groupId, createdBy, expiresAt })", suite: D_INVITES, kills: ["only the hash is stored, never the token"], why: "the token itself is stored" },
];



const CLAIMS = "src/lib/ledger/claims.ts";
const PROPOSALS = "src/lib/ledger/proposals.ts";
const TYPED = "src/lib/chain/typed-data.ts";
const SHARE = "src/lib/ledger/share.ts";
const SCHEMA = "src/db/schema.ts";
const D_CLAIMS = "tests/db/claims.test.ts";
const D_MANY = "tests/db/confirm-many.test.ts";
const D_SHARE = "tests/db/share.test.ts";
const IS_YOU = 'throw new ClaimError("that one is you", "is_you");';
const c = (id: string, find: string, replace: string, kills: string[], why: string, extra: Partial<Mutant> = {}): Mutant => ({ id, file: CLAIMS, find, replace, suite: D_CLAIMS, kills, why, ...extra });

const claims: Mutant[] = [
  c("resolve-drops-hash", "values({ displayName, phoneHash, createdBy: creatorId })", "values({ displayName, phoneHash: null, createdBy: creatorId })", ["a picked contact becomes a ghost carrying the hash", "the same number in another spelling reuses the creator's ghost"], "a picked ghost is stored without its hash, so it can never bind by phone"),
  c("resolve-typed-name-collides", "values({ displayName, phoneHash: null, createdBy: creatorId })", "values({ displayName, phoneHash: Buffer.alloc(32), createdBy: creatorId })", ["a typed name makes a new ghost with no hash, every time"], "typed names share one fake hash"),
  c("resolve-ignores-accounts", "    if (user) {\n", "    if (user && user.id === creatorId) {\n", ["a number that belongs to an account resolves to that account"], "an account-holder's number makes a ghost"),
  c("resolve-own-number", IS_YOU, "void 0;", ["picking your own number is refused"], "you can be your own debtor", { nth: 1 }),
  c("resolve-shares-ghosts-across-creators", "eq(schema.participantClaims.createdBy, creatorId),\n            eq(schema.participantClaims.phoneHash", "eq(schema.participantClaims.phoneHash", ["another creator picking the same number gets their own ghost"], "one creator's ghost is handed to another creator"),
  { id: "cover-names-nobody", file: PROPOSALS, find: '      fromClaim: debtor.kind === "claim" ? debtor.claimId : null,\n', replace: "      fromClaim: null,\n", suite: D_CLAIMS, kills: ["a cover against a ghost is a pending row naming the ghost"], why: "the cover forgets who it is against" },
  c("ghost-dyad-every-time", "    if (g) return g;\n", "", ["the ghost dyad is formed once"], "a new dyad on every call"),
  c("link-anonymous-sender", 'creatorName: creator?.displayName ?? "A friend"', 'creatorName: "A friend"', ["the creator can make a claim link and it reads back to the ghost"], "the link forgets who sent it"),
  c("ghost-anyone-acts", '  if (claim.createdBy !== creatorId) throw new ClaimError("only the person who added them can do that", "not_yours");\n', "", ["someone else cannot make a link for that ghost", "someone else cannot merge the creator's ghost", "someone else cannot dismiss the creator's ghost"], "anyone can link, merge, or dismiss anyone's ghost"),
  c("link-read-issues-token", "  if (!link) return null;\n  const claim = await survivor(db, link.claimId);", "  if (!link) return null;\n  await db.insert(schema.claimTokens).values({ tokenHash: hashToken(newToken()) as Buffer, claimId: link.claimId });\n  const claim = await survivor(db, link.claimId);", ["reading a link issues nothing"], "a page view, or a preview bot, arms a browser token"),
  c("browser-token-is-link-token", "  const browserToken = newToken();", "  const browserToken = linkToken;", ["that's-me issues a browser token that is not the link token, and it resolves to the ghost", "the link token is not a browser token"], "the URL the creator composed is itself the credential"),
  c("browser-tokens-resolve-nothing", "    if (claim && !claim.claimedBy) out.set(claim.id, claim);\n", "", ["that's-me issues a browser token that is not the link token, and it resolves to the ghost", "a ghost can concede from their browser, once", "a login in the browser holding the token binds"], "a held token reaches nobody"),
  c("concede-repeats", "        isNull(schema.obligationProposals.concededAt),\n", "", ["a ghost can concede from their browser, once"], "conceding twice succeeds twice"),
  c("concede-any-token", "        inArray(\n          schema.obligationProposals.fromClaim,\n          claims.map((c) => c.id),\n        ),\n", "", ["a stranger's token, and another ghost's token, cannot concede"], "any ghost's token concedes any ghost's row"),
  c("bind-by-phone-ignores-hash", "eq(schema.participantClaims.phoneHash, phoneHash),\n        isNull", "sql`${schema.participantClaims.displayName} like 'Zqx%'`,\n        isNull", ["a phone login binds every ghost with that hash, across creators, and only those"], "a phone login binds ghosts whose hash does not match (confined to this test's marker names)"),
  c("bind-by-phone-one-creator", "        ne(schema.participantClaims.createdBy, userId),\n      ),\n    );", "        ne(schema.participantClaims.createdBy, userId),\n      ),\n    )\n    .limit(1);", ["a phone login binds every ghost with that hash, across creators, and only those"], "only one creator's ghost binds"),
  c("bind-forgets-ghost-debtor", ".set({ fromClaim: null, fromUser: userId, fromBoundClaim: claim.id })", ".set({ fromClaim: null, fromUser: userId })", ["bound rows name the user and remember the ghost", "the first screen lists what arrived by binding, oldest first, and nothing else", "this-Gabe-is-that-Gabe binds the ghost to a friend the creator shares a group with", "binding to someone the creator already has a dyad with leaves one dyad, holding the ghost's rows"], "the third signing rule loses its evidence: nothing records that the position was a ghost's"),
  c("bind-clears-concession", ".set({ fromClaim: null, fromUser: userId, fromBoundClaim: claim.id })", ".set({ fromClaim: null, fromUser: userId, fromBoundClaim: claim.id, concededAt: null })", ["a conceded row stays conceded through the bind"], "binding wipes the concession"),
  c("bind-leaves-ghost-seat", "          .set({ claimId: null, userId })\n", "          .set({ leftAt: new Date() })\n", ["the ghost's seat in the group becomes the user's"], "the user never gets the ghost's seat"),
  c("bind-not-marked", ".set({ claimedBy: userId, claimedAt: now })", ".set({ claimedAt: now })", ["the ghost is marked claimed, and binding again is a no-op"], "a bound ghost still looks unclaimed"),
  c("bind-second-taker", '      throw new ClaimError("someone else already said that was them", "already_claimed");', "      return { claimId: claim.id, proposalIds: [] };", ["a second person cannot take a claimed ghost"], "a second person is told the bind worked"),
  c("token-for-claimed-ghost", "  if (!link || link.claim.claimedBy) return null;\n  const browserToken", "  if (!link) return null;\n  const browserToken", ["a link to a claimed ghost issues no token"], "a claimed ghost's link still arms browsers"),
  c("first-screen-newest-first", ".orderBy(asc(schema.obligationProposals.createdAt), asc(schema.obligationProposals.id));", ".orderBy(desc(schema.obligationProposals.createdAt), asc(schema.obligationProposals.id));", ["the first screen lists what arrived by binding, oldest first, and nothing else"], "the signed order and the shown order disagree"),
  c("first-screen-everything", "        sql`${schema.obligationProposals.fromBoundClaim} is not null`,\n", "", ["the first screen lists what arrived by binding, oldest first, and nothing else", "a ghost creditor binds with its provenance kept, and the debtor is asked who it turned out to be"], "ordinary pending rows land on the claimant's first screen"),
  c("bind-own-ghost", "    if (c.createdBy === userId) continue;\n", "", ["the creator's own browser never binds their own ghost"], "both guards gone: a creator's browser binds their own ghost", { also: [{ file: CLAIMS, find: IS_YOU, replace: "void 0;", nth: 2 }] }),
  c("bind-self", IS_YOU, "void 0;", ["a creator is never their own ghost"], "a creator becomes their own ghost", { nth: 2 }),
  c("bind-forgets-ghost-creditor", ".set({ toClaim: null, toUser: userId, toBoundClaim: claim.id })", ".set({ toClaim: null, toUser: userId })", ["a ghost creditor binds with its provenance kept, and the debtor is asked who it turned out to be"], "nothing records that the creditor was a ghost, so nobody is asked to re-confirm"),
  c("reconfirm-everything", "        sql`${schema.obligationProposals.toBoundClaim} is not null`,\n", "", ["an ordinary cover is not a creditor re-confirmation"], "every pending row is framed as a re-confirmation"),
  c("bind-self-cover-survives", "and(eq(schema.obligationProposals.fromClaim, claim.id), eq(schema.obligationProposals.toUser, userId)),", "and(eq(schema.obligationProposals.fromClaim, claim.id), eq(schema.obligationProposals.toUser, claim.id)),", ["a row that would become a cover of oneself is closed, and the user keeps one seat"], "a cover of oneself is rewritten instead of closed"),
  c("bind-keeps-both-seats", "        await tx.delete(schema.groupMembers).where(and(eq(schema.groupMembers.groupId, m.groupId), eq(schema.groupMembers.claimId, claim.id)));\n", "", ["a row that would become a cover of oneself is closed, and the user keeps one seat"], "the ghost's seat lingers beside the user's"),
  c("fold-off", "      if (await foldGhostDyad(tx, m.groupId, claim.id, userId)) continue;\n", "", ["binding to someone the creator already has a dyad with leaves one dyad, holding the ghost's rows", "a fold maps the ghost dyad's dollars onto the existing dyad's dollars, not a second dollar unit", "a fold carries over a unit the existing dyad does not have", "a ghost dyad with onchain state refuses to fold, loudly, and the bind does not happen"], "the bug as reported: two dyads for one pair"),
  c("fold-duplicates-dollars", "        ? t.template === d.template\n", "        ? false\n", ["a fold maps the ghost dyad's dollars onto the existing dyad's dollars, not a second dollar unit"], "the surviving dyad ends up with two dollar units"),
  c("fold-drops-new-units", "      await tx.update(schema.denominations).set({ groupId: target }).where(eq(schema.denominations.id, d.id));\n", "", ["a fold carries over a unit the existing dyad does not have"], "a unit the target lacks is not carried over"),
  c("fold-ignores-onchain-state", "  if (group.onchainId !== null || minted || denoms.some((d) => d.onchainId !== null)) {", "  if (denoms.length < 0) {", ["a ghost dyad with onchain state refuses to fold, loudly, and the bind does not happen"], "a registered group is deleted from under its onchain state"),
  c("fold-into-any-dyad", "    join ${schema.groupMembers} y on y.group_id = g.id and y.user_id = ${userId}\n    where g.is_dyad and g.id <> ${groupId}\n", "    where g.is_dyad and g.id <> ${groupId}\n", ["a first-time signup has nothing to fold: the ghost dyad simply becomes theirs"], "a new person's rows fold into a dyad the creator has with someone else (the creator is a temporary user, so only test dyads are reachable)"),
  c("merge-leaves-rows", "    await tx.update(schema.obligationProposals).set({ fromClaim: into.id }).where(eq(schema.obligationProposals.fromClaim, source.id));\n", "", ["two ghosts merge into one, and the survivor takes the rows and the phone hash"], "the merged ghost keeps its rows"),
  c("merge-loses-hash", "    if (!into.phoneHash && source.phoneHash) {", "    if (!into.phoneHash && !source.phoneHash) {", ["two ghosts merge into one, and the survivor takes the rows and the phone hash"], "the phone hash dies with the merged ghost, so the survivor never binds by phone"),
  c("merge-strands-tokens", "    if (!row.mergedInto) return row;\n", "    return row;\n", ["a token and a link for the merged ghost still reach the survivor", "two ghosts merge into one, and the survivor takes the rows and the phone hash"], "both routes gone: merges are not followed and tokens and links are not moved", {
    also: [
      { file: CLAIMS, find: "    await tx.update(schema.claimTokens).set({ claimId: into.id }).where(eq(schema.claimTokens.claimId, source.id));\n", replace: "" },
      { file: CLAIMS, find: "    await tx.update(schema.claimLinks).set({ claimId: into.id }).where(eq(schema.claimLinks.claimId, source.id));\n", replace: "" },
    ],
  }),
  c("merged-ghost-still-listed", "isNull(schema.participantClaims.claimedBy), isNull(schema.participantClaims.mergedInto)))\n    .orderBy(desc(", "isNull(schema.participantClaims.claimedBy)))\n    .orderBy(desc(", ["the merged ghost no longer shows as the creator's, and the survivor does"], "a merged-away ghost is still offered"),
  c("merge-onto-strangers", '    if ((Array.from(shared)[0]?.n ?? 0) === 0) throw', "    if ((Array.from(shared)[0]?.n ?? 0) < 0) throw", ["a ghost cannot be pointed at someone the creator shares no group with"], "a ghost's rows can be pushed onto any account"),
  c("merge-onto-self", IS_YOU, "void 0;", ["a creator cannot point a ghost at themselves"], "both guards gone: a creator merges a ghost into themselves", { nth: 3, also: [{ file: CLAIMS, find: IS_YOU, replace: "void 0;", nth: 2 }] }),
  c("merge-into-friend-does-nothing", "    await bindClaimToUser(source.id, target.userId);\n    return;", "    return;", ["this-Gabe-is-that-Gabe binds the ghost to a friend the creator shares a group with"], "the merge reports success and binds nothing"),
  c("dismiss-keeps-hash", "    await tx.update(schema.participantClaims).set({ phoneHash: null }).where(eq(schema.participantClaims.id, claim.id));\n", "", ["dismissal deletes the phone hash and keeps the row", "picking a dismissed ghost's number again starts a fresh ghost"], "a dismissed person's phone hash is kept"),
  c("dismiss-leaves-rows-pending", '.where(and(eq(schema.obligationProposals.status, "pending"), or(eq(schema.obligationProposals.fromClaim, claim.id)', '.where(and(eq(schema.obligationProposals.status, "declined"), or(eq(schema.obligationProposals.fromClaim, claim.id)', ["dismissal closes the pending row, kills the link, and takes the ghost out of the group"], "a dismissed ghost's rows stay pending"),
  c("dismiss-leaves-link-live", "set({ revokedAt: now })", "set({ revokedAt: null })", ["dismissal closes the pending row, kills the link, and takes the ghost out of the group"], "a dismissed ghost's link still works"),
  c("revoked-claim-link-reads", ".where(and(eq(schema.claimLinks.tokenHash, tokenHash), isNull(schema.claimLinks.revokedAt)))", ".where(eq(schema.claimLinks.tokenHash, tokenHash))", ["dismissal closes the pending row, kills the link, and takes the ghost out of the group"], "a revoked claim link still reads"),
  c("dismiss-leaves-seat", ".set({ leftAt: now })", ".set({ leftAt: null })", ["dismissal closes the pending row, kills the link, and takes the ghost out of the group"], "a dismissed ghost stays in the group"),
  c("suggest-any-name", "      and lower(split_part(trim(c.display_name), ' ', 1)) = ${first}\n", "", ["a same-named ghost in a shared group is suggested, never bound, and a different name is not"], "every ghost in a shared group is suggested"),
  c("suggest-nothing", "    where c.claimed_by is null and c.merged_into is null and c.created_by <> ${userId}", "    where c.claimed_by is not null and c.merged_into is null and c.created_by <> ${userId}", ["a same-named ghost in a shared group is suggested, never bound, and a different name is not"], "nothing is ever suggested"),
  c("suggest-across-groups", "gu on gu.group_id = gc.group_id and gu.user_id = ${userId}", "gu on gu.user_id = ${userId}", ["a same-named ghost in a group the person is not in is not suggested"], "ghosts are suggested to people outside their groups"),
  c("add-ghost-without-membership", '  if (!me) throw new ClaimError("only someone in the group can add people", "not_allowed");\n', "", ["only someone in a named group can add a ghost to it, and never to a dyad"], "a non-member seats a ghost in a group"),
  c("add-ghost-to-dyad", '  if (!group || group.isDyad) throw new ClaimError("that group cannot take new people", "not_allowed");', '  if (!group) throw new ClaimError("that group cannot take new people", "not_allowed");', ["only someone in a named group can add a ghost to it, and never to a dyad"], "a third seat in a dyad"),
  c("limit-off", ">= CONTACT_RESOLUTIONS_PER_HOUR) {", ">= CONTACT_RESOLUTIONS_PER_HOUR * 1000) {", ["resolutions by number are capped per person per hour, and the cap is per person", "a burst of parallel resolutions cannot slip past the cap"], "no limit"),
  c("limit-shared-by-everyone", "      where user_id = ${userId} and created_at > now() - interval '1 hour'", "      where created_at > now() - interval '1 hour'", ["resolutions by number are capped per person per hour, and the cap is per person"], "one busy person locks everyone out"),
  c("limit-never-forgets", "      where user_id = ${userId} and created_at > now() - interval '1 hour'", "      where user_id = ${userId}", ["a resolution older than an hour no longer counts"], "a lifetime cap, not an hourly one"),
  c("limit-races", "    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`contact-resolution:${userId}`}, 0))`);\n", "", ["a burst of parallel resolutions cannot slip past the cap"], "parallel requests all read the same count and all pass"),
  { id: "limit-records-the-number", file: SCHEMA, find: '    createdAt: ts("created_at").notNull().defaultNow(),\n  },\n  (t) => [index("contact_resolutions_user_created")', replace: '    createdAt: ts("created_at").notNull().defaultNow(),\n    phoneHash: bytea("phone_hash"),\n  },\n  (t) => [index("contact_resolutions_user_created")', suite: D_CLAIMS, kills: ["the limit records who asked and when, and nothing about the number"], why: "the limiter starts keeping what was asked about" },
];

const many: Mutant[] = [
  { id: "typed-data-field-order", file: TYPED, find: '    { name: "qtys", type: "uint256[]" },\n    { name: "obligationIds", type: "bytes16[]" },', replace: '    { name: "obligationIds", type: "bytes16[]" },\n    { name: "qtys", type: "uint256[]" },', suite: D_MANY, kills: ["the deployed ledger accepts a batch signed through the app's typed data, and refuses the same signature over any altered batch"], why: "the app's ConfirmMany type no longer matches the contract's" },
  { id: "batch-ids-reversed", file: PROPOSALS, find: "      obligationIds: proposals.map((p) => uuidToBytes16(p.id)),", replace: "      obligationIds: proposals.map((p) => uuidToBytes16(p.id)).reverse(),", suite: D_MANY, kills: ["the batch builder keeps the signed order and names each creditor's ledger address"], why: "ids signed in a different order from everything else" },
  { id: "batch-one-creditor", file: PROPOSALS, find: "    const a = p.toUser ? creditorLedgers.get(p.toUser) : undefined;", replace: "    const a = creditorLedgers.values().next().value;", suite: D_MANY, kills: ["the batch builder keeps the signed order and names each creditor's ledger address"], why: "every row is attributed to one creditor" },
  { id: "batch-sorted", file: PROPOSALS, find: "  const proposals = proposalIds.map((id) => {", replace: "  const proposals = [...proposalIds].sort().map((id) => {", suite: D_MANY, kills: ["the batch builder keeps the signed order and names each creditor's ledger address"], why: "the batch is loaded in a different order from the one signed" },
  { id: "batch-anyones-rows", file: PROPOSALS, find: '    if (p.fromUser !== debtorUserId) throw new ConfirmError("only the person named can confirm this", "not_debtor");\n', replace: "", suite: D_MANY, kills: ["a batch naming someone else's row is refused"], why: "anyone can load anyone's rows into a batch" },
  { id: "batch-uncapped", file: PROPOSALS, find: "  if (proposalIds.length > CONFIRM_MANY_MAX) throw", replace: "  if (proposalIds.length > CONFIRM_MANY_MAX * 100) throw", suite: D_MANY, kills: ["a batch is capped, because the declared gas grows per item and Monad charges what is declared"], why: "no cap on the declared gas" },
  { id: "batch-duplicates", file: PROPOSALS, find: "  if (new Set(proposalIds).size !== proposalIds.length) throw", replace: "  if (proposalIds.length < 0) throw", suite: D_MANY, kills: ["a batch listing the same row twice is refused"], why: "one row confirmed twice in a batch" },
];

const share: Mutant[] = [
  { id: "cover-card-full-name", file: SHARE, find: "clip(firstName(row.creditor), 18)", replace: "clip(row.creditor, 18)", suite: D_SHARE, kills: ["a cover's card says the first name of who covered, and that is all", "a cover against someone who is not here yet gets a card too, still naming only who covered"], why: "a full display name on a card in a group chat" },
  { id: "cover-card-for-closed-rows", file: SHARE, find: '  if (!row || row.status !== "pending") return PLAIN;', replace: "  if (!row) return PLAIN;", suite: D_SHARE, kills: ["an unknown id, a malformed id, and a closed cover all get the same plain card"], why: "a closed cover still announces itself" },
  { id: "cover-card-names-the-debtor", file: SHARE, find: "eq(schema.users.id, schema.obligationProposals.toUser)", replace: "eq(schema.users.id, schema.obligationProposals.fromUser)", suite: D_SHARE, kills: ["a cover's card says the first name of who covered, and that is all", "a cover against someone who is not here yet gets a card too, still naming only who covered"], why: "the card names the person it is against" },
  { id: "claim-card-full-name", file: SHARE, find: "clip(firstName(link.creatorName), 18)", replace: "clip(link.creatorName, 18)", suite: D_SHARE, kills: ["a claim link's card says the sender's first name and one-or-several, and that is all"], why: "the bug found in this audit: the claim card carried the full display name" },
  { id: "claim-card-never-plural", file: SHARE, find: "n > 1 ? `${who} got these.`", replace: "n > 99 ? `${who} got these.`", suite: D_SHARE, kills: ["a claim link's card says the sender's first name and one-or-several, and that is all"], why: "several covers read as one" },
  { id: "claim-card-for-claimed-ghost", file: SHARE, find: "  if (!link || link.claim.claimedBy) return PLAIN;", replace: "  if (!link) return PLAIN;", suite: D_SHARE, kills: ["a dead, claimed, or unknown claim link gets the same plain card"], why: "a spent link still previews its sender" },
];



const H = "tests/http/pages.test.ts";
const P_CLAIM = "src/app/c/[token]/page.tsx";
const P_COVER = "src/app/o/[id]/page.tsx";
const P_GHOST = "src/app/p/c/[id]/page.tsx";
const P_WELCOME = "src/app/welcome/page.tsx";
const P_HOME = "src/app/page.tsx";
const h = (id: string, file: string, find: string, replace: string, kills: string[], why: string, extra: Partial<Mutant> = {}): Mutant => ({ id, file, find, replace, suite: H, kills, why, ...extra });

const http: Mutant[] = [
  h("landing-anonymous", P_CLAIM, "{creatorName} thinks you’re", "Someone thinks you’re", ["the claim landing page says who the sender thinks you are and what they covered"], "the landing page does not say who sent it"),
  h("landing-concede-before-thats-me", P_CLAIM, "  const held = me ? false : (await claimsForBrowserTokens(await readClaimTokens())).some((c) => c.id === claim.id);", "  const held = true;", ["it offers that's-me and sign-in, and nothing that acts before someone says who they are"], "a visitor who never said who they are is offered the concede control"),
  h("landing-view-issues-token", CLAIMS, "  if (!link) return null;\n  const claim = await survivor(db, link.claimId);", "  if (!link) return null;\n  await db.insert(schema.claimTokens).values({ tokenHash: hashToken(newToken()) as Buffer, claimId: link.claimId });\n  const claim = await survivor(db, link.claimId);", ["opening a claim link sets no cookie and issues no token"], "the check that was hardcoded to pass: a page view, or a preview bot, mints a token"),
  h("preview-full-name", SHARE, "clip(firstName(link.creatorName), 18)", "clip(link.creatorName, 18)", ["the claim preview names the sender by first name only"], "the preview metadata carries the full display name"),
  h("dead-links-distinguishable", P_CLAIM, '<p className="text-body text-ink-2">Ask whoever sent it for a fresh one.</p>', '<p className="text-body text-ink-2">{token.length === 43 ? "Ask whoever sent it for a fresh one." : "That is not a link."}</p>', ["a malformed link and an unknown well-formed link read exactly the same"], "the page says why a link is dead, which tells a prober what a live token looks like"),
  h("claim-card-always-plain", SHARE, "  if (!link || link.claim.claimedBy) return PLAIN;", "  if (token.length > 0) return PLAIN;", ["the claim card, the invite card, and the cover card are PNGs, and differ from the plain card"], "a live claim link gets the plain card"),
  h("dead-invite-card-differs", "src/app/join/[token]/opengraph-image.tsx", "  if (!group || !group.name) return renderShareCard(plainCard);", '  if (!group || !group.name) return renderShareCard({ ...plainCard, footer: "This invite is no longer good." });', ["dead links of every kind get byte-identical plain cards"], "a dead invite's card says it is dead, so a preview reveals whether a token was ever live"),
  h("cover-preview-full-name", SHARE, "clip(firstName(row.creditor), 18)", "clip(row.creditor, 18)", ["a shared cover answers a preview bot with a card: first name, and nothing about what or how much"], "the cover preview carries the full display name"),
  h("cover-preview-redirects", P_COVER, "  if (!me) {\n", '  if (!me) redirect("/");\n  if (!me) {\n', ["a shared cover answers a preview bot with a card: first name, and nothing about what or how much"], "the state before this phase closed: a preview bot gets a redirect and no card", { also: [{ file: P_COVER, find: 'import { notFound } from "next/navigation";', replace: 'import { notFound, redirect } from "next/navigation";' }] }),
  h("unknown-cover-announces", P_COVER, '"Nothing to see here yet."', '"Someone got this one."', ["an unknown cover link, signed out, says nothing and looks like the plain brand"], "an unknown id reads like a live one"),
  h("cover-open-to-anyone", P_COVER, "  if (proposal.fromUser !== me.id && proposal.toUser !== me.id) notFound();\n", "", ["a cover is shown in full only to the two people in it"], "any signed-in person reads any cover"),
  h("ghost-cover-open-to-anyone", P_COVER, "  if (proposal.fromClaim && proposal.toUser === me.id) {", "  if (proposal.fromClaim) {", ["a cover against someone not here yet is visible to the person who logged it, and to nobody else"], "any signed-in person reads a cover against a ghost"),
  h("ghost-page-no-dismiss", "src/components/ledger/ghost-actions.tsx", "          Let them go\n", "          Remove\n", ["the creator sees their ghost's page, with the link and the way to let them go"], "the dismiss control is gone or renamed"),
  h("ghost-page-open-to-anyone", P_GHOST, "  if (!ghost || ghost.createdBy !== me.id) notFound();", "  if (!ghost) notFound();", ["someone else gets a 404 for that ghost, and a signed-out visitor is sent home"], "anyone reads anyone's ghost page"),
  h("creator-offered-own-link", P_CLAIM, "  if (me && claim.createdBy === me.id) {", '  if (me && claim.createdBy === "nobody") {', ["the creator opening their own link is told it does nothing for them"], "the creator is offered that's-me on their own ghost"),
  h("signed-in-view-binds-silently", P_CLAIM, "  const { claim, creatorName } = link;\n", '  const { claim, creatorName } = link;\n  if (me && claim.createdBy !== me.id) await (await import("@/lib/ledger/claims")).bindClaimToUser(claim.id, me.id);\n', ["a signed-in friend gets one explicit tap, not a silent bind"], "the ruling reversed: a forwarded link binds whoever opens it"),
  h("home-hides-ghosts", P_HOME, "not here yet", "here", ["home lists the ghost among people, and the cover form offers the ghost and someone new"], "home does not mark ghosts"),
  h("first-screen-ungrouped", P_WELCOME, "With {creditor.displayName}", "{creditor.displayName}", ["the first screen groups what was waiting by who it is with, and offers one yes for all"], "the first screen loses its grouping"),
  h("empty-inbox-shown", P_WELCOME, '  if (rows.length === 0) redirect("/");\n', "", ["home carries a strip back to it, and someone with nothing waiting is sent home instead of an empty inbox"], "someone with nothing waiting sees an empty inbox"),
  h("strip-for-everyone", P_HOME, "{waiting.length > 0 ? (", "{waiting.length >= 0 ? (", ["home carries a strip back to it, and someone with nothing waiting is sent home instead of an empty inbox"], "everyone is told things were waiting"),
  h("zone-cookie-ignored", "src/lib/ui/zone.ts", '  return validZone(raw ? decodeURIComponent(raw) : null) ?? "UTC";', '  return "UTC";', ["a timestamp is painted in the zone the browser reported, not the server's"], "the spec violation as reported: times painted in a fixed zone"),
  h("banned-scan-blind", H, "const BANNED = /\\b(owes?|owed|debt|balance|outstanding|overdue|wallet|transaction|gas|signature|chain|token)\\b/i;", "const BANNED = /\\b(zzzzzz)\\b/i;", ["the banned-word scan can see a banned word when one is there"], "the scanner the seven copy checks rely on matches nothing"),
  h("banned-on-landing", P_CLAIM, "{creatorName} thinks you’re", "{creatorName} thinks you owe them and you’re", ["no banned word on the claim landing page"], "banned word on the page"),
  h("banned-on-first-screen", P_WELCOME, '"Your friends kept track."', '"Your outstanding balance."', ["no banned word on the first screen"], "banned word on the page"),
  h("banned-on-ghost-page", P_GHOST, "not here yet", "no wallet yet", ["no banned word on the ghost page"], "banned word on the page"),
  h("banned-on-cover-form", "src/components/ledger/new-cover-form.tsx", "              + someone new\n", "              + someone new to the chain\n", ["no banned word on the cover form"], "banned word on the page"),
  h("banned-on-group-page", "src/app/g/[id]/page.tsx", "Dollars, until someone invents something better.", "Dollars, until someone invents a token.", ["no banned word on the group page"], "banned word on the page"),
  h("banned-on-signed-out-cover", P_COVER, '"Sign in to have a look. Nothing counts until you say so."', '"Sign in to see the debt."', ["no banned word on the signed-out cover page"], "banned word on the page"),
  h("banned-on-cover-page", P_COVER, "Sound right? One tap and it’s on the record between you two.", "Sound right? One tap and the transaction is signed.", ["no banned word on the cover page"], "banned word on the page"),
];

export const MUTANTS: Mutant[] = [...unit, ...invites, ...claims, ...many, ...share, ...http];
