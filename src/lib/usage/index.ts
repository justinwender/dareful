/**
 * Recording usage events on the server (the field round, 2026-10-02; the table is `usage_events`). The one way a
 * row is written: the ledger's modules call `record` where the thing happens, and the browser's door
 * (`/api/usage`) calls it after checking the name and the properties. It never throws into the path that called
 * it: a count that fails is logged and the person's own thing still goes through.
 */
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { db, schema } from "@/db";
import { EVENTS, type EventName, type EventProps } from "./events";

export const DEVICE_COOKIE = "dareful_device";
const DEVICE_DAYS = 365;

export type Actor = { userId?: string | null; claimId?: string | null; deviceId?: string | null };
export type About = { dareId?: string | null; gameId?: string | null };

/** `u:`, `c:` or `d:` and the id: the part of a once-key that says who, an account before a claim before a device. */
export function actorKey(actor: Actor): string | null {
  if (actor.userId) return `u:${actor.userId}`;
  if (actor.claimId) return `c:${actor.claimId}`;
  if (actor.deviceId) return `d:${actor.deviceId}`;
  return null;
}

/** A link opened counts once per person or device per link; everything else counts every time. */
export function onceKeyFor(name: EventName, actor: Actor, about: About, props: Record<string, unknown>): string | null {
  if (name !== "link_opened") return null;
  const who = actorKey(actor);
  if (!who) return null;
  const link = typeof props.link === "string" ? props.link : "page";
  const target = about.dareId ? `m:${about.dareId}` : about.gameId ? `g:${about.gameId}` : link;
  return `opened:${link}:${target}:${who}`;
}

export async function record<N extends EventName>(name: N, props: EventProps<N>, actor: Actor = {}, about: About = {}): Promise<void> {
  try {
    const checked = EVENTS[name].safeParse(props);
    if (!checked.success) {
      console.error("usage event refused", { name, issues: checked.error.issues.map((i) => i.path.join(".")) });
      return;
    }
    await db
      .insert(schema.usageEvents)
      .values({
        name,
        userId: actor.userId ?? null,
        claimId: actor.claimId ?? null,
        deviceId: actor.deviceId ?? null,
        dareId: about.dareId ?? null,
        gameId: about.gameId ?? null,
        props: checked.data,
        onceKey: onceKeyFor(name, actor, about, checked.data as Record<string, unknown>),
      })
      .onConflictDoNothing();
  } catch (err) {
    console.error("usage event not recorded", { name, err: err instanceof Error ? err.message : err });
  }
}

/** The device's own id from its cookie, or a fresh one with the cookie set; a random id and nothing else. */
export async function deviceId(): Promise<string> {
  const jar = await cookies();
  const have = jar.get(DEVICE_COOKIE)?.value;
  if (have && /^[0-9a-f-]{36}$/.test(have)) return have;
  const fresh = randomUUID();
  try {
    jar.set(DEVICE_COOKIE, fresh, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: DEVICE_DAYS * 86_400 });
  } catch {
    // A render that cannot set cookies (a server component) still gets an id for this request; the door sets it.
  }
  return fresh;
}
