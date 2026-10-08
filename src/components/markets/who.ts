import type { Hue } from "@/lib/ui/hue";
import type { InkName } from "@/lib/ui/ink";

/**
 * Who a question goes to. Asking and starting a game skip "Who's in" (the games-and-the-reveal round, 2026-10-07, the
 * owner's call): a new question goes to whoever its asker sends it to, a set of one that grows as people join, and
 * adding one to a game keeps that game's own people. A saved set's facts, for the terms step of adding one.
 */
export type SetOption = { groupId: string; label: string; caption: string; avatars: Array<{ name: string; hue: Hue }>; offerName: boolean; size: number; units: Array<{ id: string; label: string; template: string | null }>; /** The inks of the questions still open in this set, for balance (1.8, rule 4). */ takenInks: InkName[] };
export type Person = { id: string; name: string; hue: Hue };
export type Who = { kind: "set"; groupId: string } | { kind: "people"; userIds: string[] } | { kind: "link" };
