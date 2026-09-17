"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { copyDenominationToGroup, createDenomination, TEMPLATES, type TemplateKey } from "@/lib/ledger/denominations";
import { isMember } from "@/lib/ledger/groups";

const NewUnit = z.object({
  groupId: z.string().uuid(),
  template: z.enum(["beer", "coffee", "round", "next_time"]).nullable().optional(),
  label: z.string().trim().min(1).max(40),
  pluralLabel: z.string().trim().max(40).optional(),
  quantifiable: z.boolean(),
  markEmoji: z.string().trim().max(16).optional(),
});

export type UnitSummary = {
  id: string;
  groupId: string;
  label: string;
  pluralLabel: string;
  quantifiable: boolean;
  monetary: boolean;
  template: string | null;
  markKind: string | null;
  markValue: string | null;
};

export async function createDenominationAction(input: z.infer<typeof NewUnit>): Promise<UnitSummary | { error: string }> {
  const user = await requireUser();
  const parsed = NewUnit.safeParse(input);
  if (!parsed.success) return { error: "That unit needs a name under 40 characters." };
  const data = parsed.data;
  if (!(await isMember(data.groupId, user.id))) return { error: "You are not in that group." };
  const template = (data.template ?? null) as TemplateKey | null;
  const preset = template ? TEMPLATES[template] : null;
  const row = await createDenomination({
    groupId: data.groupId,
    createdBy: user.id,
    template,
    label: preset ? preset.label : data.label,
    pluralLabel: preset ? preset.pluralLabel : (data.pluralLabel || data.label),
    quantifiable: preset ? preset.quantifiable : data.quantifiable,
    monetary: false,
    markEmoji: data.markEmoji ?? null,
  });
  return summarize(row);
}

export async function reuseDenominationAction(sourceId: string, groupId: string): Promise<UnitSummary | { error: string }> {
  const user = await requireUser();
  if (!(await isMember(groupId, user.id))) return { error: "You are not in that group." };
  const row = await copyDenominationToGroup(sourceId, groupId, user.id);
  return summarize(row);
}

function summarize(row: { id: string; groupId: string; label: string; pluralLabel: string; quantifiable: boolean; monetary: boolean; template: string | null; markKind: string | null; markValue: string | null }): UnitSummary {
  return {
    id: row.id,
    groupId: row.groupId,
    label: row.label,
    pluralLabel: row.pluralLabel,
    quantifiable: row.quantifiable,
    monetary: row.monetary,
    template: row.template,
    markKind: row.markKind,
    markValue: row.markValue,
  };
}
