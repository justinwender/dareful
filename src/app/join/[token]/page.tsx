import { SignInButton } from "@/components/auth/sign-in-button";
import { JoinGroup } from "@/components/ledger/join-group";
import { Screen, TopBar } from "@/components/ledger/screen";
import { currentUser } from "@/lib/auth/session";
import { groupWithMembers, readInviteToken } from "@/lib/ledger/groups";

export const dynamic = "force-dynamic";

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = readInviteToken(token);
  const group = invite ? await groupWithMembers(invite.groupId) : null;
  const me = await currentUser();
  return (
    <Screen>
      <TopBar title="Dareful" />
      <div className="flex flex-1 flex-col justify-center gap-6 py-10">
        {!invite || !group ? (
          <>
            <h1 className="text-display text-ink">That link has expired.</h1>
            <p className="text-body text-ink-2">Ask whoever sent it for a fresh one.</p>
          </>
        ) : me ? (
          <>
            <h1 className="text-display text-ink">{group.name}</h1>
            <JoinGroup token={token} />
          </>
        ) : (
          <>
            <h1 className="text-display text-ink">You’re invited to {group.name}.</h1>
            <p className="text-body text-ink-2">An email or a phone number is all it takes, and the group is waiting on the other side.</p>
            <SignInButton label="Join" />
          </>
        )}
      </div>
    </Screen>
  );
}
