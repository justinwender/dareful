import Link from "next/link";
import { Screen, TopBar } from "@/components/ledger/screen";

/**
 * The claimant screen's three states with nothing to claim (docs/design.md 3.38): the link has expired, someone
 * already said this was them, or it is the link you made yourself. One state at a time, in its own file, so the
 * type budget counts its serif 26 on its own and never beside the live screen's serif 40 (4.8).
 */
export function ClaimGone(props: { state: "expired"; signedIn: boolean } | { state: "used"; signedIn: boolean; creatorName: string } | { state: "own"; signedIn: true; name: string; claimId: string }) {
  return (
    <Screen>
      <TopBar title="Dareful" back={props.signedIn} />
      <div className="flex flex-1 flex-col justify-center gap-6 py-10">
        {props.state === "expired" ? (
          <>
            <h1 className="text-serif-l text-ink">That link has expired.</h1>
            <p className="text-body text-ink-2">Ask whoever sent it for a fresh one.</p>
          </>
        ) : props.state === "own" ? (
          <>
            <h1 className="text-serif-l text-ink">This is the link you made for {props.name}.</h1>
            <p className="text-body text-ink-2">Send it to them from your own messages. It does nothing for you.</p>
            <Link prefetch={false} href={`/p/c/${props.claimId}`} className="link-tertiary">
              Back to {props.name}
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-serif-l text-ink">Someone already said this was them.</h1>
            <p className="text-body text-ink-2">If that was you, sign in and it’s all there. If it wasn’t, tell {props.creatorName}.</p>
            {props.signedIn ? (
              <Link prefetch={false} href="/" className="link-tertiary">
                Go home
              </Link>
            ) : null}
          </>
        )}
      </div>
    </Screen>
  );
}
