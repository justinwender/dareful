"use client";

import { useEffect, useState } from "react";

/**
 * The signed-out screen's headline (the field round, 1.9): three questions in turn, so the first screen says what
 * the product is by example. The box is held at the height of the longest, so nothing under it moves; each
 * change is the base fade from the motion set, and under Reduce Motion the first question stands still.
 */
export const FIRST_QUESTIONS = ["Will dinner start on time?", "Who wins, Jets or Bears?", "Will the train be late?"] as const;
const EVERY_MS = 4000;

export function FirstQuestion() {
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState(true);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still) return;
    let i = 0;
    const timer = setInterval(() => {
      setShown(false);
      setTimeout(() => {
        i = (i + 1) % FIRST_QUESTIONS.length;
        setIndex(i);
        setShown(true);
      }, 200);
    }, EVERY_MS);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="grid" data-first-question="">
      {/* Every question laid in the same cell, the longest setting the height; only one is visible. */}
      {FIRST_QUESTIONS.map((q, i) => (
        <h1 key={q} aria-hidden={i !== index} className="col-start-1 row-start-1 text-serif-xl text-ink transition-opacity duration-(--motion-base) ease-fade" style={{ opacity: i === index && shown ? 1 : 0, pointerEvents: "none" }}>
          {q}
        </h1>
      ))}
    </div>
  );
}
