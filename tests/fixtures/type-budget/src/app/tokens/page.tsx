import { ObligationToken } from "../../components/ledger/obligation-token";
// Four sizes on content; the obligation token carries two more (a second serif size and Hanken 20) that are
// outside the count, because text inside a token is an object on the page, not more of its text (1.2, 4.8).
export default function Tokens() {
  return (
    <main>
      <h1 className="text-serif-l">A question?</h1>
      <p className="text-body">Prose.</p>
      <p className="text-body-sm">Support.</p>
      <span className="text-label">A kicker</span>
      <ObligationToken />
    </main>
  );
}
