// Four sizes on content, and a fifth only on a control (the code field at Hanken 20): within the budget, because
// text inside a control is outside the count (docs/design.md 1.2, 4.8).
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
