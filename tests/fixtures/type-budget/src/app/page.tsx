import { Row } from "../components/row";
// Five sizes on one screen: over the budget of four (docs/design.md 1.2). The label in the row is the caption's
// size, so it adds a token and not a size.
export default function Five() {
  return (
    <main>
      <h1 className="text-serif-l">A question?</h1>
      <p className="text-body">Prose.</p>
      <p className="text-body-sm">Support.</p>
      <p className="text-caption">Metadata.</p>
      <span className="text-numeral">12</span>
      <Row />
    </main>
  );
}
