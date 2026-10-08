/**
 * What a routine action is, named for the server to sign from its own inputs (docs/design.md 3.41, amended
 * 2026-09-28; 3.45): entering, asking, saying yep, closing and cancelling out. The client never sends typed
 * data to be signed; it names the action and the ids, and the server rebuilds exactly the message the action
 * itself will verify. A vote is not here and never will be: it is a governance-wallet signature (Principle 10).
 */
import { z } from "zod";

const uuid = z.string().uuid();
const whole = z.string().regex(/^-?\d{1,30}$/);

export const Via = z.discriminatedUnion("action", [
  z.object({ action: z.literal("enter"), dareId: uuid, stake: whole, value: whole }),
  z.object({ action: z.literal("create"), dareId: uuid }),
  /** The terms agreed to again over the question's own group, beside an entry (the games-and-the-reveal round, 2026-10-07): recorded as a `create`. */
  z.object({ action: z.literal("create_question"), dareId: uuid }),
  z.object({ action: z.literal("confirm"), proposalId: uuid }),
  z.object({ action: z.literal("confirm_many"), proposalIds: z.array(uuid).min(1).max(50) }),
  z.object({ action: z.literal("close"), obligationId: z.string().min(1), reason: z.enum(["settled", "forgiven"]) }),
  z.object({ action: z.literal("net"), otherUserId: uuid, groupId: uuid, denomId: uuid }),
]);
export type Via = z.infer<typeof Via>;
