import { Row } from "../components/row";
// Five of the nine on one screen: over the budget of four (docs/design.md 1.2).
export default function Five() {
  return (
    <main>
      <h1 className="text-serif-l">A question?</h1>
      <p className="text-body">Prose.</p>
      <p className="text-body-sm">Support.</p>
      <p className="text-caption">Metadata.</p>
      <Row />
    </main>
  );
}
