import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Avatar } from "@/components/ledger/avatar";
import { UnitGlyph } from "@/components/ledger/glyphs";
import { InviteShare } from "@/components/ledger/invite-share";
import { MarkStamp } from "@/components/ledger/mark-stamp";
import { ObligationToken } from "@/components/ledger/obligation-token";
import { ActionArea, Screen, SectionLabel, TopBar } from "@/components/ledger/screen";
import { ButtonLink } from "@/components/ui/button";
import { currentUser } from "@/lib/auth/session";
import { denominationsForGroup } from "@/lib/ledger/denominations";
import { openInGroup } from "@/lib/ledger/envio";
import { createInviteToken, groupWithMembers, isMember } from "@/lib/ledger/groups";
import { bufferToHex, bytes16ToUuid } from "@/lib/ledger/ids";
import { db, schema } from "@/db";
import { inArray } from "drizzle-orm";
import { hueFor } from "@/lib/ui/hue";
import { glyphKeyOf } from "@/lib/ui/units";

export const dynamic = "force-dynamic";

export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await currentUser();
  if (!me) redirect("/");
  const { id } = await params;
  const group = await groupWithMembers(id);
  if (!group || !(await isMember(group.id, me.id))) notFound();

  const units = await denominationsForGroup(group.id);
  const open = group.onchainId ? await openInGroup(bufferToHex(group.onchainId)) : [];
  const byWallet = new Map(group.members.filter((m) => m.ledgerWallet && m.userId).map((m) => [m.ledgerWallet as string, { id: m.userId as string, displayName: m.displayName }]));
  const rows = open.length ? await db.select().from(schema.obligations).where(inArray(schema.obligations.id, open.map((o) => bytes16ToUuid(o.id)))) : [];
  const denomOf = new Map(units.map((u) => [u.id, u]));
  const rowById = new Map(rows.map((r) => [r.id, r]));
  const edges = open
    .map((o) => {
      const row = rowById.get(bytes16ToUuid(o.id));
      const debtor = byWallet.get(o.debtor);
      const creditor = byWallet.get(o.creditor);
      const denomination = row ? denomOf.get(row.denomId) : undefined;
      if (!row || !debtor || !creditor || !denomination) return null;
      return { id: o.id, debtor, creditor, denomination, remaining: BigInt(o.remaining) };
    })
    .filter((e): e is NonNullable<typeof e> => Boolean(e));

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://dareful.app";
  const invite = `${appUrl}/join/${createInviteToken(group.id, me.id)}`;
  const name = group.name ?? "Just you two";

  return (
    <Screen>
      <TopBar back={{ href: "/", label: "Back" }} />
      <div className="flex flex-col gap-7 py-2">
        <h1 className="text-display text-ink">{name}</h1>

        <section className="flex flex-col gap-3">
          <SectionLabel>Who’s in</SectionLabel>
          <ul className="flex flex-col gap-1.5">
            {group.members.map((m) => (
              <li key={m.userId ?? m.claimId ?? m.displayName}>
                {m.userId && m.userId !== me.id ? (
                  <Link href={`/p/${m.userId}`} className="flex h-12 items-center gap-3 rounded-button bg-surface px-3">
                    <Avatar name={m.displayName} hue={hueFor(m.userId)} size={28} />
                    <span className="text-body-strong text-ink">{m.displayName}</span>
                  </Link>
                ) : (
                  <div className="flex h-12 items-center gap-3 rounded-button bg-surface px-3">
                    <Avatar name={m.displayName} hue={m.userId ? hueFor(m.userId) : "stone"} size={28} ghost={!m.userId} />
                    <span className="text-body-strong text-ink">{m.userId === me.id ? "You" : m.displayName}</span>
                    {!m.userId ? <span className="text-caption text-ink-3">not signed up yet</span> : null}
                  </div>
                )}
              </li>
            ))}
          </ul>
          {!group.isDyad ? (
            <div className="flex flex-col gap-2 rounded-card border border-dashed border-line-strong p-4">
              <p className="text-body-sm text-ink-2">Anyone with this link joins the group. Send it from your own messages.</p>
              <InviteShare url={invite} text={`Join ${name} on Dareful:`} />
            </div>
          ) : null}
        </section>

        <section className="flex flex-col gap-3">
          <SectionLabel>Open</SectionLabel>
          {edges.length === 0 ? (
            <p className="text-body-sm text-ink-2">Everyone’s even.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {edges.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 rounded-button bg-surface px-3 py-2">
                  <span className="text-body-sm text-ink-2">
                    {e.debtor.id === me.id ? "You've got" : `${e.debtor.displayName}'s got`} {e.creditor.id === me.id ? "you" : e.creditor.displayName}
                  </span>
                  <ObligationToken
                    owner={{ id: e.debtor.id, displayName: e.debtor.displayName, hue: hueFor(e.debtor.id) }}
                    other={e.creditor}
                    viewerId={me.id}
                    denomination={e.denomination}
                    quantity={e.remaining}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <SectionLabel>Units this group runs on</SectionLabel>
          {units.length === 0 ? (
            <p className="text-body-sm text-ink-2">Dollars, until someone invents something better.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {units.map((u) => {
                const glyph = glyphKeyOf(u);
                return (
                  <li key={u.id} className="inline-flex h-9 items-center gap-2 rounded-pill border border-line-strong px-3 text-[13px] font-medium text-ink-2">
                    {u.markKind && u.markValue ? <MarkStamp kind={u.markKind === "image" ? "image" : "emoji"} value={u.markValue} size={20} inToken /> : null}
                    {glyph ? <UnitGlyph unit={glyph} size={16} /> : null}
                    {u.monetary ? "dollars" : u.template ? u.pluralLabel : `“${u.label}”`}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
      {group.members.some((m) => m.userId && m.userId !== me.id) ? (
        <ActionArea>
          <ButtonLink href={`/new?group=${group.id}`} variant="primary" className="w-full">
            I got this one
          </ButtonLink>
        </ActionArea>
      ) : null}
    </Screen>
  );
}
