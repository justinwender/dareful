// Four tokens on content, and two more only on controls (a field's label and the field): within the budget,
// because a control's label is outside the count (docs/design.md 1.2; docs/decisions.md 2026-09-25).
export default function Controls() {
  return (
    <main>
      <h1 className="text-serif-l">A question?</h1>
      <p className="text-body">Prose.</p>
      <p className="text-body-sm">Support.</p>
      <span className="text-label">A kicker</span>
      <label htmlFor="x" className="text-caption">
        The code
      </label>
      <input id="x" className="text-numeral" />
    </main>
  );
}
