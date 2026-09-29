"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** A screen has arrived (9.8): the direction mark a Back left on `html` is cleared, so the next arrival reads forward unless told otherwise. */
export function Arrived() {
  const path = usePathname();
  useEffect(() => {
    const t = setTimeout(() => document.documentElement.classList.remove("back"), 0);
    return () => clearTimeout(t);
  }, [path]);
  return null;
}
