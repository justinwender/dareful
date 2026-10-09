/**
 * The owner's own accounts, left out of every count (the submission round, section 1). The database stores no email
 * address, so each account's sign-in addresses are read from Dynamic (`DYNAMIC_API_TOKEN`, read-only): the record's
 * email, its email credentials and the addresses a linked Google account carries. The owner's mailbox is read the same
 * way from his counted account, and an account matches when any of its addresses is the same mailbox: the same part
 * before any `+`, at the same domain, with dots ignored for Gmail. Addresses stay inside this process: nothing here
 * prints, logs or stores one. Only ids and when each account was made are printed.
 *
 *   npx tsx --env-file=.env.local scripts/ops/owner-accounts.ts <counted account id>           lists the matches
 *   npx tsx --env-file=.env.local scripts/ops/owner-accounts.ts <counted account id> --apply   leaves them out of every count
 *
 * The counted account itself is never left out, whatever it matches.
 */
import { and, eq, inArray, notLike } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";

const Credential = z.object({ format: z.string().optional(), email: z.string().optional(), oauth_emails: z.array(z.string()).optional(), oauthEmails: z.array(z.string()).optional() }).passthrough();
const Emailed = z.object({ email: z.string().nullish(), verifiedCredentials: z.array(Credential).optional(), verified_credentials: z.array(Credential).optional() }).passthrough();
const DynamicUser = z.union([z.object({ user: Emailed }), Emailed]);

/** How an address reached the record: the record's own email, an email sign-in, or a linked account (Google). */
export type Via = "record" | "email" | "linked";

/** Every address a Dynamic user record carries, with how: its email, every email credential's, every linked account's. Pure. */
export function addressesWithVia(json: unknown): Array<{ address: string; via: Via }> {
  const parsed = DynamicUser.safeParse(json);
  if (!parsed.success) return [];
  const u: z.infer<typeof Emailed> = "user" in parsed.data && parsed.data.user ? (parsed.data.user as z.infer<typeof Emailed>) : (parsed.data as z.infer<typeof Emailed>);
  const out: Array<{ address: string; via: Via }> = [];
  if (u.email) out.push({ address: u.email, via: "record" });
  for (const c of u.verifiedCredentials ?? u.verified_credentials ?? []) {
    if (c.email) out.push({ address: c.email, via: c.format === "email" ? "email" : "linked" });
    for (const e of c.oauth_emails ?? c.oauthEmails ?? []) out.push({ address: e, via: "linked" });
  }
  return out.filter((a) => z.string().email().safeParse(a.address).success);
}

/** Every address a Dynamic user record carries. Pure. */
export function addressesOf(json: unknown): string[] {
  return [...new Set(addressesWithVia(json).map((a) => a.address))];
}

/** What kind of match an address is to the owner's own, in words that carry no part of either address. Pure. */
export function matchKind(address: string, ownerAddresses: readonly string[]): string {
  const a = address.trim().toLowerCase();
  if (ownerAddresses.some((o) => o.trim().toLowerCase() === a)) return "the same address";
  if (a.split("@")[0]?.includes("+")) return "a plus-alias";
  return "the same mailbox written another way";
}

/** The mailbox an address delivers to: lowercased, anything after `+` dropped, and Gmail's dots ignored. Pure. */
export function mailboxOf(address: string): string {
  const [rawLocal = "", rawDomain = ""] = address.trim().toLowerCase().split("@");
  const domain = rawDomain === "googlemail.com" ? "gmail.com" : rawDomain;
  let local = rawLocal.split("+")[0] ?? "";
  if (domain === "gmail.com") local = local.replaceAll(".", "");
  return `${local}@${domain}`;
}

async function record(dynamicUserId: string): Promise<unknown | null> {
  const env = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID;
  const token = process.env.DYNAMIC_API_TOKEN;
  if (!env || !token) throw new Error("NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID and DYNAMIC_API_TOKEN are needed");
  const res = await fetch(`https://app.dynamicauth.com/api/v0/environments/${env}/users/${dynamicUserId}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return null;
  return res.json();
}

async function main(): Promise<void> {
  const counted = process.argv[2];
  const apply = process.argv.includes("--apply");
  if (!counted || !z.string().uuid().safeParse(counted).success) throw new Error("name the owner's counted account by its id");
  const U = schema.users;
  const people = await db.select({ id: U.id, dynamicUserId: U.dynamicUserId, createdAt: U.createdAt, excluded: U.excludedFromCounts }).from(U).where(notLike(U.dynamicUserId, "%:%"));
  const owner = people.find((p) => p.id === counted);
  if (!owner) throw new Error("the counted account has no Dynamic record here");
  const ownerRecord = await record(owner.dynamicUserId);
  const ownerAddresses = addressesOf(ownerRecord);
  const mine = new Set(ownerAddresses.map(mailboxOf));
  if (mine.size === 0) throw new Error("the counted account's record carries no address");
  console.log(`the counted account's record carries ${mine.size} mailbox(es); reading ${people.length - 1} other account(s)`);

  const matches: Array<(typeof people)[number] & { how: string }> = [];
  let unread = 0;
  for (const p of people) {
    if (p.id === counted) continue;
    const r = await record(p.dynamicUserId);
    if (r === null) {
      unread++;
      continue;
    }
    const hits = addressesWithVia(r).filter((a) => mine.has(mailboxOf(a.address)));
    if (hits.length) matches.push({ ...p, how: [...new Set(hits.map((h) => `${h.via === "linked" ? "a linked Google account" : h.via === "email" ? "an email sign-in" : "the record's email"}, ${matchKind(h.address, ownerAddresses)}`))].join("; ") });
    await new Promise((done) => setTimeout(done, 150));
  }
  console.log(`${matches.length} account(s) on the same mailbox${unread ? `, ${unread} record(s) Dynamic would not return` : ""}:`);
  for (const m of matches) console.log(`  ${m.id}  made ${m.createdAt.toISOString()}  ${m.excluded ? "already left out" : "counted"}  (${m.how})`);
  if (!apply) return;
  const toLeaveOut = matches.filter((m) => !m.excluded).map((m) => m.id);
  if (toLeaveOut.length) await db.update(U).set({ excludedFromCounts: true }).where(and(inArray(U.id, toLeaveOut), eq(U.excludedFromCounts, false)));
  console.log(`left out ${toLeaveOut.length}`);
}

main()
  .then(() => process.exit(0))
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message.split("\n")[0] : "failed");
    process.exit(1);
  });
