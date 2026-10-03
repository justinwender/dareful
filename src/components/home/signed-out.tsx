import { SignInButton } from "@/components/auth/sign-in-button";
import { Screen, TopBar } from "@/components/ledger/screen";
import { FIRST_LINE } from "@/lib/ui/copy";
import { FirstQuestion } from "./first-question";

/** Now, signed out: one state of the root, in its own file so the type budget counts it on its own (4.8). Nothing is behind it, so its header is the wordmark alone (3.38). */
export function SignedOut() {
  return (
    <Screen>
      <TopBar wordmark />
      <SignedOutBody />
    </Screen>
  );
}

/** What the signed-out screen says, under whatever header it has. */
export function SignedOutBody() {
  return (
    <div className="flex flex-1 flex-col justify-center gap-6 py-10">
      <FirstQuestion />
      <p className="text-body text-ink-2">{FIRST_LINE}</p>
      <SignInButton />
      <p className="text-caption text-ink-3">An email or a phone number is all it takes.</p>
    </div>
  );
}
