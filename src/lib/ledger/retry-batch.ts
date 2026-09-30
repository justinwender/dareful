/**
 * What a tap on the claimant screen still has to send, after what an earlier tap already landed (docs/design.md
 * 5.2, Try again; 3.38): a landed batch of covers or a landed entry is never signed or sent again, since the server
 * refuses a confirmed proposal ("already settled one way or the other") and a retry that led with it would end
 * there, with the entries after it never sent. Pure, so the rule has a test; the screen records what lands.
 */
export function stillToSend(pressed: { claims: readonly string[]; entries: readonly string[] }, landed: { claims: ReadonlySet<string>; entries: ReadonlySet<string> }): { claims: string[]; entries: string[] } {
  return { claims: pressed.claims.filter((id) => !landed.claims.has(id)), entries: pressed.entries.filter((id) => !landed.entries.has(id)) };
}
