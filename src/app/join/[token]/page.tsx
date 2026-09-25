import type { Metadata } from "next";
import { SignInButton } from "@/components/auth/sign-in-button";
import { JoinGroup } from "@/components/ledger/join-group";
import { Screen, TopBar } from "@/components/ledger/screen";
import { currentUser } from "@/lib/auth/session";
import { groupWithMembers, readInvite } from "@/lib/ledger/groups";

export const dynamic = "force-dynamic";

/** The text beside the invite's card (opengraph-image.tsx). A dead link reads as the plain card. */
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const invite = await readInvite(token).catch(() => null);
  const group = invite ? await groupWithMembers(invite.groupId) : null;
  const title = group?.name ? `You’re invited to ${group.name}` : "Dareful";
  return { title, description: "An email or a phone number is all it takes.", robots: { index: false, follow: false }, openGraph: { title } };
}

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Reading a link changes nothing and never signs anyone in; only a signed-in person's redeem joins the group.
  const invite = await readInvite(token);
  const group = invite ? await groupWithMembers(invite.groupId) : null;
  const me = await currentUser();
  return (
    <Screen>
      <TopBar title="Dareful" back={Boolean(me)} />
      <div className="flex flex-1 flex-col justify-center gap-6 py-10">
        {!invite || !group ? (
          <>
            <h1 className="text-serif-l text-ink">That link has expired.</h1>
            <p className="text-body text-ink-2">Ask whoever sent it for a fresh one.</p>
          </>
        ) : me ? (
          <>
            <h1 className="text-serif-l text-ink">{group.name}</h1>
            <JoinGroup token={token} />
          </>
        ) : (
          <>
            <h1 className="text-serif-l text-ink">You’re invited to {group.name}.</h1>
            <p className="text-body text-ink-2">An email or a phone number is all it takes, and the group is waiting on the other side.</p>
            <SignInButton label="Join" />
          </>
        )}
      </div>
    </Screen>
  );
}
