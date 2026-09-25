// Two serif sizes on one screen (docs/design.md 1.2), inside four sizes.
export default function TwoSerifs() {
  return (
    <main>
      <h1 className="text-serif-xl">Headline</h1>
      <p className="text-serif-m">A question in a row?</p>
      <p className="text-body">Prose.</p>
    </main>
  );
}
