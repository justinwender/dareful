// A duration and a curve typed outside the set (docs/design.md 9.1).
export default function Motion() {
  return (
    <div className="transition-opacity duration-200 ease-out">
      <span style={{ transitionDuration: "700ms" }}>Moving</span>
    </div>
  );
}
