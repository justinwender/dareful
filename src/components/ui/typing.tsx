"use client";

import { useEffect } from "react";
import { takesKeyboard, typingFromViewport, typingStarts, TYPING } from "@/lib/ui/viewport";

/**
 * Whether the keyboard is up, worn on the root as `data-typing` (`src/lib/ui/viewport.ts`, the rules). One set of
 * document listeners: the last element a finger went down on, a flag for the task a tap is being handled in, the
 * focus moving in and out, a tap on a field that already had the focus, and the visible part of the screen moving.
 * Focus passing from one field to the next keeps the keyboard; leaving the fields lets it go.
 */
export function Typing() {
  useEffect(() => {
    const root = document.documentElement;
    let down: Element | null = null;
    let gesture = false;
    let settle: ReturnType<typeof setTimeout> | null = null;
    const set = (on: boolean) => {
      if (on) root.setAttribute(TYPING, "");
      else root.removeAttribute(TYPING);
    };
    const touched = (field: Element) => {
      if (!down) return false;
      if (field.contains(down)) return true;
      const label = down.closest("label");
      return !!label && label.control === field;
    };
    const onDown = (e: PointerEvent) => {
      down = e.target instanceof Element ? e.target : null;
    };
    const onGesture = () => {
      gesture = true;
      if (settle) clearTimeout(settle);
      settle = setTimeout(() => {
        gesture = false;
      }, 0);
    };
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target instanceof Element ? e.target : null;
      if (!t || !takesKeyboard(t) || root.hasAttribute(TYPING)) return;
      if (typingStarts({ field: true, touched: touched(t), inGesture: gesture })) set(true);
    };
    const onFocusOut = (e: FocusEvent) => {
      const next = e.relatedTarget instanceof Element ? e.relatedTarget : null;
      if (!takesKeyboard(next)) set(false);
    };
    const onClick = (e: MouseEvent) => {
      const t = e.target instanceof Element ? e.target : null;
      if (t && takesKeyboard(t) && t === document.activeElement) set(true);
    };
    const vv = window.visualViewport;
    const onViewport = () => {
      const verdict = typingFromViewport({ field: takesKeyboard(document.activeElement), visible: vv?.height ?? window.innerHeight, layout: window.innerHeight });
      if (verdict !== null) set(verdict);
    };
    document.addEventListener("pointerdown", onDown, true);
    for (const type of ["pointerup", "touchend", "click", "keydown"]) document.addEventListener(type, onGesture, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    document.addEventListener("click", onClick, true);
    vv?.addEventListener("resize", onViewport);
    window.addEventListener("pageshow", onViewport);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      for (const type of ["pointerup", "touchend", "click", "keydown"]) document.removeEventListener(type, onGesture, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      document.removeEventListener("click", onClick, true);
      vv?.removeEventListener("resize", onViewport);
      window.removeEventListener("pageshow", onViewport);
      if (settle) clearTimeout(settle);
    };
  }, []);
  return null;
}
