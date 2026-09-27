/**
 * Delegation (PLANNING.md section 7; docs/decisions.md 2026-09-27): the server signs a person's routine ledger
 * actions with the share Dynamic handed it, so those actions are silent. This is the only module that reads
 * or writes the `delegations` table. Nothing here logs, returns or exports a share or a wallet's key, and no
 * error carries one.
 *
 * Three things keep the split honest, and each is enforced here rather than promised:
 *
 * - **The governance wallet is never delegated.** Nothing asks Dynamic for it (`delegation-control.tsx` names
 *   the ledger wallet by address), the receiver refuses an event for it before decrypting anything
 *   (`delegationRefusal`), the database refuses to store one (the trigger in migration 0001), and the signer
 *   refuses to build a delegated wallet for that address before it looks anything up. A vote is a
 *   governance-wallet signature and always prompts; this module cannot produce one.
 * - **Delegation removes the prompt, never the person.** A delegated signature is made only inside a request
 *   the same person authenticated for that action, and each one is recorded with that request
 *   (`delegated_signatures`), so any one of them traces back.
 * - **It degrades to a prompt.** No delegation, a revoked one, or material that will not open is
 *   `DelegationUnavailable`, and the caller signs on the client as before. Nothing about the ledger depends on
 *   the server being able to sign.
 *
 * The webhook: Dynamic posts `wallet.delegation.created` with the share and the per-wallet key, each in a
 * hybrid envelope (RSA-OAEP over an AES-256-GCM key) under the public key registered in its console. The
 * receiver verifies the HMAC over the raw body bytes, decrypts with the private key held only in the
 * environment (`DYNAMIC_DELEGATION_PRIVATE_KEY`), seals both again under the app's own key
 * (`DELEGATION_STORE_KEY`, AES-256-GCM, bound to the row) and stores them. `wallet.delegation.revoked` wipes
 * the material and marks the row. Events are idempotent by id and ordered by Dynamic's own timestamp.
 */
import { constants as cryptoConstants, createCipheriv, createDecipheriv, createHmac, privateDecrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { hashTypedData, recoverTypedDataAddress, type Hex, type TypedDataDefinition } from "viem";
import { z } from "zod";
import { db, schema } from "@/db";

export class DelegationUnavailable extends Error {
  constructor(userId: string, why: string) {
    super(`no usable delegation for user ${userId} (${why}); sign client-side with a prompt`);
    this.name = "DelegationUnavailable";
  }
}

/** Asked to sign for a governance wallet: a bug in the caller, never a fallback. */
export class GovernanceNeverDelegated extends Error {
  constructor() {
    super("the governance wallet is never delegated: a vote always prompts");
    this.name = "GovernanceNeverDelegated";
  }
}

// ----------------------------------------------------------------------------------------- the decision

/**
 * Whether an address may be signed for with a delegated share: null for the person's ledger wallet,
 * "governance" for their governance wallet, "unknown" for anything else (an orphan wallet from an old bug, or
 * somebody else's). Pure, so the rule has a test; case never matters for an address.
 */
export function delegationRefusal(input: { address: string; ledgerWallet: string; governanceWallet: string }): "governance" | "unknown" | null {
  const a = input.address.trim().toLowerCase();
  if (a === input.governanceWallet.trim().toLowerCase()) return "governance";
  if (a === input.ledgerWallet.trim().toLowerCase()) return null;
  return "unknown";
}

// ---------------------------------------------------------------------------------------- the envelope

const AES_KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** The app's own key for what it stores: 64 hex characters in the environment, never in the database. */
export function storeKey(): Buffer {
  const hex = process.env.DELEGATION_STORE_KEY ?? "";
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error("DELEGATION_STORE_KEY is not set to 64 hex characters");
  return Buffer.from(hex, "hex");
}

/** AES-256-GCM with a fresh IV, bound to `aad` (the row it belongs to): iv, then tag, then ciphertext. */
export function seal(plain: Buffer, key: Buffer, aad: string): Buffer {
  if (key.length !== AES_KEY_BYTES) throw new Error("a sealing key is 32 bytes");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]);
}

/** The inverse; null when the key, the binding or the bytes are wrong, never a partial plaintext. */
export function open(sealed: Buffer, key: Buffer, aad: string): Buffer | null {
  if (key.length !== AES_KEY_BYTES || sealed.length < IV_BYTES + TAG_BYTES) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, sealed.subarray(0, IV_BYTES));
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(sealed.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    return Buffer.concat([decipher.update(sealed.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]);
  } catch {
    return null;
  }
}

/** What binds a stored blob to its row, so one row's material can never be read as another's. */
const bindingOf = (userId: string, walletId: string): string => `delegation:${userId}:${walletId}`;

// ----------------------------------------------------------------------------------------- the webhook

/**
 * Dynamic's signature over the raw request body: HMAC-SHA256 with the webhook's secret, sent as
 * `sha256=<hex>` in `x-dynamic-signature-256`, compared in constant time. The bytes hashed are the bytes
 * received, never a re-serialised object (CLAUDE.md, conventions).
 */
export function verifyWebhookSignature(secret: string, rawBody: string | Buffer, header: string | null | undefined): boolean {
  if (!secret || !header) return false;
  const given = header.trim().replace(/^sha256=/i, "");
  if (!/^[0-9a-f]{64}$/i.test(given)) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return timingSafeEqual(Buffer.from(given.toLowerCase(), "ascii"), Buffer.from(expected, "ascii"));
}

const Envelope = z.object({ alg: z.string(), iv: z.string(), ct: z.string(), tag: z.string(), ek: z.string(), kid: z.string().optional() });
export type Envelope = z.infer<typeof Envelope>;

/**
 * The real delivery (tests/fixtures/dynamic/delegation-created.json, recorded from the sandbox on 2026-09-27)
 * carries `userId` as null at the top level and the user's id inside `data`; the documentation's example had it
 * at the top. Both are read, `data` first.
 */
const Created = z.object({
  eventName: z.literal("wallet.delegation.created"),
  eventId: z.string().min(1),
  messageId: z.string().optional(),
  timestamp: z.string().min(1),
  userId: z.string().nullable().optional(),
  data: z.object({
    chain: z.string().optional(),
    walletId: z.string().min(1),
    shareSetId: z.string().optional(),
    publicKey: z.string().min(1),
    userId: z.string().optional(),
    encryptedDelegatedShare: Envelope,
    encryptedWalletApiKey: Envelope,
  }),
});
const Revoked = z.object({
  eventName: z.literal("wallet.delegation.revoked"),
  eventId: z.string().min(1),
  messageId: z.string().optional(),
  timestamp: z.string().min(1),
  userId: z.string().nullable().optional(),
  data: z.object({ walletId: z.string().min(1), chain: z.string().optional(), userId: z.string().optional() }),
});
/** Anything else Dynamic sends this door, the `ping` it registers with above all, is read for its name and ignored. */
const Other = z.object({ eventName: z.string() });
export type DelegationEvent = { kind: "created"; event: z.infer<typeof Created> } | { kind: "revoked"; event: z.infer<typeof Revoked> } | { kind: "other"; name: string };

/** An event by its name: the two that matter in full, anything else by name alone, and a named event that is malformed as nothing. */
export function parseDelegationEvent(body: unknown): DelegationEvent | null {
  const named = Other.safeParse(body);
  if (!named.success) return null;
  const name = named.data.eventName;
  if (name === "wallet.delegation.created") {
    const p = Created.safeParse(body);
    return p.success ? { kind: "created", event: p.data } : null;
  }
  if (name === "wallet.delegation.revoked") {
    const p = Revoked.safeParse(body);
    return p.success ? { kind: "revoked", event: p.data } : null;
  }
  return { kind: "other", name };
}

export type Received =
  | { ok: true; kind: "stored" | "revoked" | "duplicate" | "stale" | "ignored" | "refused"; walletId?: string }
  | { ok: false; status: 400 | 401 | 422 | 500; reason: string };

type Decrypt = (input: { privateKeyPem: string; encryptedDelegatedKeyShare: Envelope; encryptedWalletApiKey: Envelope }) => { decryptedDelegatedShare: unknown; decryptedWalletApiKey: string };

/**
 * Dynamic's hybrid envelope, opened with Node's own crypto: the content key is RSA-OAEP-SHA256 under the
 * registered public key (`ek`), the payload AES-256-GCM under that key (`iv`, `ct`, `tag`), every field
 * base64url. The same steps as the package's `decryptDelegatedWebhookData`, which the database test keeps as
 * the oracle; done here so the door never loads the package, which carries native binaries and a wasm module
 * that a deploy's file tracing cannot follow. Only the signer loads the package, and only when it signs.
 */
export function openEnvelope(privateKeyPem: string, e: Envelope): Buffer {
  const key = privateDecrypt({ key: privateKeyPem, oaepHash: "sha256", padding: cryptoConstants.RSA_PKCS1_OAEP_PADDING }, Buffer.from(e.ek, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(e.iv, "base64url"));
  decipher.setAuthTag(Buffer.from(e.tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(e.ct, "base64url")), decipher.final()]);
}

const decryptEnvelopes: Decrypt = ({ privateKeyPem, encryptedDelegatedKeyShare, encryptedWalletApiKey }) => {
  const share = openEnvelope(privateKeyPem, encryptedDelegatedKeyShare).toString("utf8");
  const apiKey = openEnvelope(privateKeyPem, encryptedWalletApiKey).toString("utf8");
  const parsed: unknown = JSON.parse(share);
  if (!parsed || !apiKey) throw new Error("empty");
  return { decryptedDelegatedShare: parsed, decryptedWalletApiKey: apiKey };
};

/**
 * The private half of the pair whose public half is registered in Dynamic's console, from the environment in
 * the forms a console field produces: the base64 of the PEM (whitespace allowed), or the PEM itself, with real
 * newlines or the two characters backslash-n a single-line field turns them into, with or without surrounding
 * quotes. Anything else is nothing, never a guess.
 */
export function delegationPrivateKeyPem(): string | null {
  let raw = process.env.DYNAMIC_DELEGATION_PRIVATE_KEY?.trim() ?? "";
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) raw = raw.slice(1, -1).trim();
  if (!raw) return null;
  const asPem = (text: string): string | null => {
    const pem = text.replace(/\\n/g, "\n").trim();
    return pem.startsWith("-----BEGIN") && pem.includes("-----END") ? pem : null;
  };
  if (raw.startsWith("-----BEGIN")) return asPem(raw);
  const compact = raw.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/=_-]+$/.test(compact)) return null;
  return asPem(Buffer.from(compact, "base64").toString("utf8"));
}

/**
 * The door's whole job, apart from answering HTTP: verify, parse, decide, decrypt, seal, store. Takes the
 * raw body so the signature is over the bytes received. `deps` lets the tests supply a decrypt of their own
 * and a clock; the route passes nothing.
 */
/** The owner hears of a governance wallet being delegated, once per event: it should be impossible, so it is worth a line even in the sandbox. */
export type Alert = (subject: string, text: string) => Promise<unknown>;
async function opsAlert(subject: string, text: string): Promise<unknown> {
  const { sendOps } = await import("@/lib/notify/channels");
  return sendOps(subject, text);
}

export async function receiveDelegationEvent(rawBody: string, signature: string | null | undefined, deps: { decrypt?: Decrypt; now?: Date; secret?: string; privateKeyPem?: string | null; alert?: Alert } = {}): Promise<Received> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { ok: false, status: 400, reason: "not JSON" };
  }
  const named = Other.safeParse(parsed);
  if (!named.success) return { ok: false, status: 400, reason: "not an event" };
  // The reachability ping arrives when the endpoint is registered, before its secret can be anywhere; it carries nothing, so it needs no signature.
  if (named.data.eventName === "ping") return { ok: true, kind: "ignored" };
  // The signature before the shape: an unsigned body learns nothing about what the door expects.
  const secret = deps.secret ?? process.env.DYNAMIC_WEBHOOK_SECRET ?? "";
  if (!secret) return { ok: false, status: 500, reason: "no webhook secret configured" };
  if (!verifyWebhookSignature(secret, rawBody, signature)) return { ok: false, status: 401, reason: "bad signature" };
  const ev = parseDelegationEvent(parsed);
  if (!ev) return { ok: false, status: 400, reason: "not an event" };
  if (ev.kind === "other") return { ok: true, kind: "ignored" };
  const e = ev.event;
  const now = deps.now ?? new Date();
  const eventAt = new Date(e.timestamp);
  if (Number.isNaN(eventAt.getTime())) return { ok: false, status: 400, reason: "no event time" };
  const dynamicUserId = e.data.userId ?? e.userId ?? "";
  if (!dynamicUserId) return { ok: false, status: 400, reason: "no user on the event" };
  const [user] = await db.select({ id: schema.users.id, ledgerWallet: schema.users.ledgerWallet, governanceWallet: schema.users.governanceWallet }).from(schema.users).where(eq(schema.users.dynamicUserId, dynamicUserId));
  if (!user) return { ok: false, status: 422, reason: "no such user" };
  const D = schema.delegations;
  const [row] = await db.select({ eventId: D.eventId, eventAt: D.eventAt }).from(D).where(and(eq(D.userId, user.id), eq(D.walletId, e.data.walletId)));
  if (row?.eventId === e.eventId) return { ok: true, kind: "duplicate", walletId: e.data.walletId };
  if (row?.eventAt && row.eventAt.getTime() >= eventAt.getTime()) return { ok: true, kind: "stale", walletId: e.data.walletId };

  if (e.eventName === "wallet.delegation.revoked") {
    if (!row) return { ok: true, kind: "ignored", walletId: e.data.walletId };
    await db.update(D).set({ encryptedShare: Buffer.alloc(0), encryptedApiKey: Buffer.alloc(0), revokedAt: now, eventId: e.eventId, eventAt }).where(and(eq(D.userId, user.id), eq(D.walletId, e.data.walletId)));
    return { ok: true, kind: "revoked", walletId: e.data.walletId };
  }

  // Created. The governance wallet, or a wallet that is neither of the person's two, is refused before anything is decrypted.
  const refusal = delegationRefusal({ address: e.data.publicKey, ledgerWallet: user.ledgerWallet, governanceWallet: user.governanceWallet });
  if (refusal) {
    // Acknowledged (200, so Dynamic stops), discarded (nothing decrypted, nothing stored), and the owner told: a governance
    // wallet reaching this door means something asked Dynamic for it, which nothing in the app does.
    const what = refusal === "governance" ? "the governance wallet" : "not one of the person's wallets";
    console.error(`delegation refused: wallet ${e.data.walletId} is ${what} (event ${e.eventId}, user ${user.id})`);
    if (refusal === "governance") {
      await (deps.alert ?? opsAlert)(
        "Dareful: a governance wallet was delegated",
        `Dynamic sent a delegation for a governance wallet, which nothing in the app asks for. It was refused at the door: nothing was decrypted or stored.\n\nuser ${user.id}\nwallet ${e.data.walletId}\nevent ${e.eventId} at ${e.timestamp}\n\nCheck the console's delegated-access settings ("Prompt users on sign in" must stay off) and the SDK's callers.`,
      ).catch((err: unknown) => console.error("delegation: the alert could not be sent", err instanceof Error ? err.message : err));
    }
    return { ok: true, kind: "refused", walletId: e.data.walletId };
  }
  const privateKeyPem = deps.privateKeyPem === undefined ? delegationPrivateKeyPem() : deps.privateKeyPem;
  if (!privateKeyPem) return { ok: false, status: 500, reason: "no delegation private key configured" };
  const decrypt = deps.decrypt ?? decryptEnvelopes;
  let share: Buffer;
  let apiKey: Buffer;
  try {
    const out = decrypt({ privateKeyPem, encryptedDelegatedKeyShare: e.data.encryptedDelegatedShare, encryptedWalletApiKey: e.data.encryptedWalletApiKey });
    share = Buffer.from(JSON.stringify(out.decryptedDelegatedShare), "utf8");
    apiKey = Buffer.from(out.decryptedWalletApiKey, "utf8");
  } catch {
    // Never the error itself: Dynamic's message may quote what it failed to decrypt.
    return { ok: false, status: 400, reason: "could not decrypt" };
  }
  const key = storeKey();
  const binding = bindingOf(user.id, e.data.walletId);
  const values = {
    userId: user.id,
    walletId: e.data.walletId,
    walletAddress: e.data.publicKey.toLowerCase(),
    encryptedShare: seal(share, key, binding),
    encryptedApiKey: seal(apiKey, key, binding),
    shareSetId: e.data.shareSetId ?? null,
    eventId: e.eventId,
    eventAt,
    grantedAt: now,
    revokedAt: null,
  };
  share.fill(0);
  apiKey.fill(0);
  // The database's own trigger refuses a governance address here too (migration 0001), belt and braces.
  await db
    .insert(D)
    .values(values)
    .onConflictDoUpdate({ target: [D.userId, D.walletId], set: values });
  return { ok: true, kind: "stored", walletId: e.data.walletId };
}

// ------------------------------------------------------------------------------------------ the signer

export type DelegatedWallet = {
  walletId: string;
  shareSetId: string | null;
  address: string;
  /** Signs the typed data with the delegated share and records it against the request; the signature recovers to `address` or it throws. */
  sign: (typedData: TypedDataDefinition, request: SignatureRequest) => Promise<Hex>;
};

export type SignatureRequest = {
  action: "confirm" | "confirm_many" | "close" | "net" | "create" | "enter" | "check";
  /** The obligation, proposal or market the request named. */
  subject: string;
  /** The server action or route that made it. */
  request: string;
  requestId?: string | null;
};

type DelegatedClientModule = typeof import("@dynamic-labs-wallet/node-evm");
type DelegatedClient = ReturnType<DelegatedClientModule["createDelegatedEvmWalletClient"]>;
/** What signing needs from Dynamic: its package and a client on it. Loaded when first needed; a platform where the package cannot load (its native binary missing) fails here, and only here. */
export type SignerLoad = () => Promise<{ mod: Pick<DelegatedClientModule, "delegatedSignTypedData">; client: DelegatedClient }>;

let clientCache: DelegatedClient | undefined;
const delegatedClient: SignerLoad = async () => {
  const mod = await import("@dynamic-labs-wallet/node-evm");
  if (!clientCache) {
    const environmentId = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID ?? "";
    const apiKey = process.env.DYNAMIC_SERVER_API_TOKEN ?? "";
    if (!environmentId || !apiKey) throw new Error("NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID and DYNAMIC_SERVER_API_TOKEN are needed to sign with a delegation");
    clientCache = mod.createDelegatedEvmWalletClient({ environmentId, apiKey });
  }
  return { mod, client: clientCache };
};

/** Whether this person's ledger wallet has a usable delegation, for the screens that decide whether to prompt. Reads nothing secret. */
export async function hasDelegation(userId: string): Promise<boolean> {
  const D = schema.delegations;
  const rows = await db.select({ revokedAt: D.revokedAt, share: D.encryptedShare }).from(D).where(eq(D.userId, userId));
  return rows.some((r) => r.revokedAt === null && r.share.length > 0);
}

/**
 * Builds the delegated wallet for a person's address, or refuses. The governance wallet is refused before
 * any lookup, by address, so no caller can reach it by mistake; an address that is neither wallet is refused
 * the same way; the ledger wallet without a usable row is `DelegationUnavailable`, which means a prompt.
 */
export async function delegatedWalletFor(userId: string, address: string, deps: { load?: SignerLoad } = {}): Promise<DelegatedWallet> {
  const [user] = await db.select({ ledgerWallet: schema.users.ledgerWallet, governanceWallet: schema.users.governanceWallet }).from(schema.users).where(eq(schema.users.id, userId));
  if (!user) throw new DelegationUnavailable(userId, "no such user");
  const refusal = delegationRefusal({ address, ledgerWallet: user.ledgerWallet, governanceWallet: user.governanceWallet });
  if (refusal === "governance") throw new GovernanceNeverDelegated();
  if (refusal === "unknown") throw new DelegationUnavailable(userId, "not the ledger wallet");
  const D = schema.delegations;
  const [row] = await db
    .select()
    .from(D)
    .where(and(eq(D.userId, userId), eq(D.walletAddress, address.toLowerCase())));
  if (!row || row.revokedAt !== null || row.encryptedShare.length === 0) throw new DelegationUnavailable(userId, row ? "revoked" : "none");
  const key = storeKey();
  const binding = bindingOf(userId, row.walletId);
  const share = open(row.encryptedShare, key, binding);
  const apiKey = open(row.encryptedApiKey, key, binding);
  if (!share || !apiKey) throw new DelegationUnavailable(userId, "stored material does not open");
  let keyShare: unknown;
  try {
    keyShare = JSON.parse(share.toString("utf8"));
  } catch {
    throw new DelegationUnavailable(userId, "stored share is not readable");
  }
  const walletApiKey = apiKey.toString("utf8");
  share.fill(0);
  apiKey.fill(0);
  const walletId = row.walletId;
  const shareSetId = row.shareSetId;
  return {
    walletId,
    shareSetId,
    address: row.walletAddress,
    async sign(typedData, request) {
      const { mod, client } = await (deps.load ?? delegatedClient)();
      const signature = (await mod.delegatedSignTypedData(client, {
        walletId,
        shareSetId: shareSetId ?? undefined,
        walletApiKey,
        keyShare: keyShare as Parameters<typeof mod.delegatedSignTypedData>[1]["keyShare"],
        typedData: typedData as unknown as Parameters<typeof mod.delegatedSignTypedData>[1]["typedData"],
      })) as Hex;
      const signer = await recoverTypedDataAddress({ ...typedData, signature } as Parameters<typeof recoverTypedDataAddress>[0]);
      if (signer.toLowerCase() !== row.walletAddress.toLowerCase()) throw new Error(`a delegated signature recovered to ${signer}, not the ledger wallet`);
      await db.insert(schema.delegatedSignatures).values({
        userId,
        walletId,
        action: request.action,
        subject: request.subject,
        digest: Buffer.from(hashTypedData(typedData as Parameters<typeof hashTypedData>[0]).slice(2), "hex"),
        request: request.request,
        requestId: request.requestId ?? null,
      });
      return signature;
    },
  };
}

/**
 * The one call the ledger's actions make: a delegated signature, or null, which means the client prompts as
 * before. Every failure lands here as null and never as a thrown error, so nothing about delegation can fail
 * the person's action: no row, a revoked one, material that will not open, the package failing to load (its
 * native binary missing on the platform), Dynamic refusing, timing out or being unreachable, a signature that
 * recovers to the wrong key. A failure that is not the routine "no delegation" is logged in one line without
 * anything from the material, since a signer that silently stopped signing would otherwise look like everyone
 * revoking at once. Asking for the governance wallet is a bug in the caller: it is logged as one and still a
 * prompt, which for a vote is the right thing anyway.
 */
export async function trySignWithDelegation(req: { userId: string; address: string; typedData: TypedDataDefinition; request: SignatureRequest }, deps: { load?: SignerLoad } = {}): Promise<Hex | null> {
  try {
    const wallet = await delegatedWalletFor(req.userId, req.address, deps);
    return await wallet.sign(req.typedData, req.request);
  } catch (err) {
    if (err instanceof GovernanceNeverDelegated) console.error(`delegation: ${req.request.request} asked to sign ${req.request.action} with the governance wallet; a prompt instead`);
    else if (!(err instanceof DelegationUnavailable)) console.warn(`delegation: ${req.request.request} falls back to a prompt for ${req.request.action}: ${err instanceof Error ? `${err.name}: ${err.message.slice(0, 120)}` : "unknown failure"}`);
    return null;
  }
}
