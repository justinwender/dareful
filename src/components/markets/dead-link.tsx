import { SignInButton } from "@/components/auth/sign-in-button";
import { CodeJoinFocused } from "@/components/home/code-join";
import { Screen, TopBar } from "@/components/ledger/screen";

export const DEAD_LINK = "That link doesn’t open anything. Ask for it again, or type the code they read you.";

/**
 * A revoked or malformed market link (docs/design.md 3.17, states): the code screen with a form-level message, for
 * anyone, signed in or not. Nothing here says which market it was for, or that one ever existed. Signed out,
 * the boxes stand and sign-in is the way to use a code.
 */
export function DeadLink({ signedIn }: { signedIn: boolean }) {
  return (
    <Screen>
      {signedIn ? <TopBar back /> : <TopBar title="dareful" />}
      <div className="flex flex-col gap-7 py-2" data-dead-link="">
        <h1 className="text-serif-l text-ink">Got a code?</h1>
        <CodeJoinFocused initialProblem={DEAD_LINK} />
        {signedIn ? null : (
          <div className="flex flex-col items-start gap-2">
            <SignInButton variant="tertiary" label="Sign in" />
          </div>
        )}
      </div>
    </Screen>
  );
}
