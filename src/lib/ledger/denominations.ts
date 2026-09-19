import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";

export type DenominationRow = typeof schema.denominations.$inferSelect;

/** Templates are pre-filled suggestions; USD is the only built-in. */
export const TEMPLATES = {
  usd: { label: "dollar", pluralLabel: "dollars", quantifiable: true, monetary: true, emoji: null },
  beer: { label: "beer", pluralLabel: "beers", quantifiable: true, monetary: false, emoji: null },
  coffee: { label: "coffee", pluralLabel: "coffees", quantifiable: true, monetary: false, emoji: null },
  round: { label: "round", pluralLabel: "rounds", quantifiable: true, monetary: false, emoji: null },
  next_time: { label: "a next time", pluralLabel: "next times", quantifiable: false, monetary: false, emoji: null },
} as const;
export type TemplateKey = keyof typeof TEMPLATES;

/** Standing units get a drawn icon (design 2.2); everything else is the words someone typed. */
export const STANDING_UNITS: ReadonlySet<string> = new Set(["usd", "beer", "coffee", "round", "next_time"]);

export async function denominationsForGroup(groupId: string): Promise<DenominationRow[]> {
  return db
    .select()
    .from(schema.denominations)
    .where(eq(schema.denominations.groupId, groupId))
    .orderBy(sql`${schema.denominations.lastUsedAt} desc nulls last`, schema.denominations.label);
}

export async function denominationById(id: string): Promise<DenominationRow | null> {
  const [row] = await db.select().from(schema.denominations).where(eq(schema.denominations.id, id)).limit(1);
  return row ?? null;
}

/** USD exists in every group the moment something needs it. */
export async function ensureUsd(groupId: string, createdBy: string): Promise<DenominationRow> {
  const [existing] = await db
    .select()
    .from(schema.denominations)
    .where(and(eq(schema.denominations.groupId, groupId), eq(schema.denominations.template, "usd")))
    .limit(1);
  if (existing) return existing;
  const t = TEMPLATES.usd;
  const [row] = await db
    .insert(schema.denominations)
    .values({ groupId, template: "usd", label: t.label, pluralLabel: t.pluralLabel, quantifiable: t.quantifiable, monetary: t.monetary, createdBy })
    .returning();
  if (!row) throw new Error("could not create the dollar denomination");
  return row;
}

export type NewDenomination = {
  groupId: string;
  createdBy: string;
  template?: TemplateKey | null;
  label: string;
  pluralLabel: string;
  quantifiable: boolean;
  monetary: boolean;
  emoji?: string | null;
  markEmoji?: string | null;
};

/** Created inline, from the obligation screen, without leaving it. The mark is optional and blank by default. */
export async function createDenomination(input: NewDenomination): Promise<DenominationRow> {
  const label = input.label.trim();
  const pluralLabel = input.pluralLabel.trim() || label;
  if (!label) throw new Error("a unit needs a name");
  if (label.length > 40) throw new Error("keep the unit under 40 characters");
  const markEmoji = input.markEmoji?.trim() || null;
  const [row] = await db
    .insert(schema.denominations)
    .values({
      groupId: input.groupId,
      createdBy: input.createdBy,
      template: input.template ?? null,
      label,
      pluralLabel,
      quantifiable: input.quantifiable,
      monetary: input.monetary,
      emoji: input.emoji ?? null,
      markKind: markEmoji ? "emoji" : null,
      markValue: markEmoji,
    })
    .returning();
  if (!row) throw new Error("could not create the unit");
  return row;
}

/** The creator's own recent custom denominations from any group, for cross-group reuse. */
export async function recentDenominationsForUser(userId: string, excludeGroupId?: string): Promise<DenominationRow[]> {
  const rows = await db
    .select()
    .from(schema.denominations)
    .where(and(eq(schema.denominations.createdBy, userId), isNull(schema.denominations.template)))
    .orderBy(desc(schema.denominations.lastUsedAt), desc(schema.denominations.label))
    .limit(50);
  const seen = new Set<string>();
  const out: DenominationRow[] = [];
  for (const r of rows) {
    if (r.groupId === excludeGroupId) continue;
    const key = r.label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/** Picking a denomination from another group registers a copy in this group with its own onchain id. */
export async function copyDenominationToGroup(sourceId: string, groupId: string, createdBy: string): Promise<DenominationRow> {
  const source = await denominationById(sourceId);
  if (!source) throw new Error("unknown unit");
  const [existing] = await db
    .select()
    .from(schema.denominations)
    .where(and(eq(schema.denominations.groupId, groupId), sql`lower(${schema.denominations.label}) = lower(${source.label})`))
    .limit(1);
  if (existing) return existing;
  const [row] = await db
    .insert(schema.denominations)
    .values({
      groupId,
      createdBy,
      template: source.template,
      label: source.label,
      pluralLabel: source.pluralLabel,
      quantifiable: source.quantifiable,
      monetary: source.monetary,
      emoji: source.emoji,
      markKind: source.markKind,
      markValue: source.markValue,
    })
    .returning();
  if (!row) throw new Error("could not copy the unit");
  return row;
}

export async function touchDenomination(id: string): Promise<void> {
  await db.update(schema.denominations).set({ lastUsedAt: new Date() }).where(eq(schema.denominations.id, id));
}

export async function denominationsByIds(ids: string[]): Promise<Map<string, DenominationRow>> {
  if (ids.length === 0) return new Map();
  const rows = await db.select().from(schema.denominations).where(inArray(schema.denominations.id, ids));
  return new Map(rows.map((r) => [r.id, r]));
}

/**
 * A unit someone named while composing, before the group it belongs to necessarily existed. Between two people
 * the group is a dyad that is only created when the cover is saved, so the form cannot register a unit ahead
 * of time; it describes the unit, and the unit is found or made here, in the group the cover lands in
 * (docs/decisions.md 2026-09-19). Finding first means the same "beer" is never made twice in one group.
 */
export type UnitSpec = { template: Exclude<TemplateKey, "usd"> | null; label: string; markEmoji?: string | null };

export async function ensureUnitInGroup(groupId: string, createdBy: string, spec: UnitSpec): Promise<DenominationRow> {
  const preset = spec.template ? TEMPLATES[spec.template] : null;
  const label = (preset ? preset.label : spec.label).trim();
  if (!label) throw new Error("a unit needs a name");
  const [existing] = await db
    .select()
    .from(schema.denominations)
    .where(and(eq(schema.denominations.groupId, groupId), spec.template ? eq(schema.denominations.template, spec.template) : and(isNull(schema.denominations.template), sql`lower(${schema.denominations.label}) = lower(${label})`)))
    .limit(1);
  if (existing) return existing;
  return createDenomination({
    groupId,
    createdBy,
    template: spec.template,
    label,
    pluralLabel: preset ? preset.pluralLabel : label,
    quantifiable: preset ? preset.quantifiable : true,
    monetary: false,
    markEmoji: preset ? null : (spec.markEmoji ?? null),
  });
}
