import { currentUser } from "@/lib/auth/session";
import { guestLine } from "@/lib/ledger/guest";
import { GuestLineView } from "./guest-line-view";

/** The guest line for this screen (docs/design.md 3.46), or nothing: never for anyone signed in, and never before a guest's first market. */
export async function GuestLineFor({ dareId = null }: { dareId?: string | null }) {
  if (await currentUser()) return null;
  const g = await guestLine(dareId);
  return g ? <GuestLineView line={g.line} dareId={g.dareId} name={g.name} /> : null;
}
