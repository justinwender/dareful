"use client";

import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * A field as tall as what it holds. The ask flow's textareas say `field-sizing: content`, which Safari 26.0 does not
 * know and Safari 27 does (read on the simulators in the second-pass round, 2026-10-06): without it a question of
 * three lines showed two, and terms past three lines scrolled out of sight inside their box. Where the browser sizes
 * the field itself nothing here runs; elsewhere the height follows the content, never under the rows it was given.
 */
export function sizesItself(): boolean {
  return typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("field-sizing", "content");
}

/** The height that shows all of a field's content: its scroll height, which has the padding, and its borders. Pure. */
export function fittedHeight(field: { scrollHeight: number; offsetHeight: number; clientHeight: number }): number {
  return field.scrollHeight + (field.offsetHeight - field.clientHeight);
}

type Fittable = Pick<HTMLTextAreaElement, "scrollHeight" | "offsetHeight" | "clientHeight"> & { style: { height: string } };

/** Sizes one field to its content, where the browser will not. */
export function fitField(el: Fittable | null): void {
  if (!el || sizesItself()) return;
  // Back to the rows' height first, so a field that lost lines shrinks.
  el.style.height = "auto";
  el.style.height = `${fittedHeight(el)}px`;
}

/** A ref for a textarea: sized as it mounts and again whenever its value changes. */
export function useFitsContent(value: string): (el: HTMLTextAreaElement | null) => void {
  const field = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => fitField(field.current), [value]);
  return useCallback((el: HTMLTextAreaElement | null) => {
    field.current = el;
    fitField(el);
  }, []);
}
