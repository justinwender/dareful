import { DeadLink } from "@/components/markets/dead-link";
import { currentUser } from "@/lib/auth/session";

/**
 * Anything the app has no screen for, and every `notFound()` (docs/design.md 5.4: no framework default and no
 * full-screen error page ever reaches a person): the code screen with its one form-level line (3.17), which is
 * also what a revoked market link shows. Nothing here says what the address was for, or that anything existed.
 */
export default async function NotFound() {
  const me = await currentUser().catch(() => null);
  return <DeadLink signedIn={Boolean(me)} />;
}
