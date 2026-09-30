"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { FixedLayer } from "./layers";
import { PinnedSheet } from "./pinned-sheet";
import { TopRunner } from "./refresh";
import { useWaitStage } from "./button";
import { BackControl } from "./back-control";
import { QuestionBand } from "@/components/markets/question-band";
import { TeamStamp } from "@/components/ledger/team-stamp";
import { NOTHING_CAME_BACK, ProblemSummary } from "@/components/ledger/problem";
import { OfflineBar } from "./offline-bar";
import { InfoIcon } from "./info";
import { inkStyleText } from "@/lib/ui/ink";
import { MOTION } from "@/lib/ui/motion";
import { parseShell, type Shell } from "@/lib/ui/shell";
import { withViewTransition } from "@/lib/ui/transitions";
import { invalidated, landedOn, touchKindOf, touched, type Prefetch } from "@/lib/ui/touch-fetch";
import type { Hue } from "@/lib/ui/hue";
import { HUES } from "@/lib/ui/hue";

/** The path a link opens, without its query, for telling when the destination has landed. */
function pathOf(href: string): string {
  return href.split(/[?#]/)[0] ?? href;
}

/**
 * Shells (docs/design.md 9.4, 9.7): a tap on a row, card or question card that opens a market leaves at once for
 * the market's shell, drawn in the frame after the tap from what the row already carried (`data-shell`): the
 * header, the market's ground, surfaces and line, the band whole, and the sheet at the resting height of the state
 * the row showed with its first line. The market's ink opens out of the row's stamp into the band as a view
 * transition (`market-ink`, `market-mark`); the old page holds under it; the tab bar and the Start button fade out.
 * When the real screen lands the shell fades over base and goes. If the landing is slow: the 2px runner under the
 * status band at 300ms, "Still going." at three seconds under the last thing drawn, and at ten the block with "Try
 * again", one set of stages with a working button (`useWaitStage`). Back works throughout. A game page from
 * What's on opens the same way, from the game row's box into the header band, its two stamps travelling.
 * The history entry is added at the tap, before the shell is drawn, so the picture the phone keeps for its own
 * swipe back is the screen that was left and never the shell over it; a traversal drops the shell at once.
 */
export function Shells() {
  const pathname = usePathname();
  const router = useRouter();
  const [shell, setShell] = useState<{ data: Shell; href: string; from: string } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const names = useRef<Array<() => void>>([]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>("a[data-shell]") : null;
      if (!a) return;
      // A row slid open for its swipe takes the tap to close itself (3.15): nothing opens, so nothing is drawn.
      if (a.closest("[data-call-off-open]")) return;
      const data = parseShell(a.getAttribute("data-shell"));
      const href = a.getAttribute("href");
      if (!data || !href) return;
      // The one element that travels takes its name just before the transition starts, and loses it after (9.3).
      const named: Array<[HTMLElement, string]> = [];
      if (data.kind === "market") {
        const stamp = a.querySelector<HTMLElement>("[data-stamp]");
        const mark = a.querySelector<HTMLElement>("[data-stamp-mark]");
        if (stamp) named.push([stamp, "market-ink"]);
        if (mark) named.push([mark, "market-mark"]);
      } else {
        named.push([a, "market-ink"]);
        const stamps = a.querySelectorAll<HTMLElement>("[data-team-stamp]");
        if (stamps[0]) named.push([stamps[0], "market-mark"]);
        if (stamps[1]) named.push([stamps[1], "market-mark-2"]);
      }
      const from = location.pathname;
      // The history entry is added here, at the tap and before the shell is drawn: the phone keeps a picture of
      // the screen being left at the moment an entry is added and shows it under its swipe back, and with the
      // shell already up that picture was the market's own band over the list (docs/decisions.md 2026-09-29).
      // The prototype's method is called so the router hears nothing; when the screen lands it finds the
      // address already there and writes its own state over this entry rather than adding another.
      if (pathOf(href) !== from) {
        try {
          History.prototype.pushState.call(window.history, { shell: true }, "", href);
        } catch {
          // Refused (a sandboxed frame): the router adds the entry as before.
        }
      }
      // A name is one element's at a time (9.3): whatever on the page being left wears one of these (a game
      // page's header, a band) gives it up for the row that travels, or the transition finds two and is skipped.
      const others: Array<[HTMLElement, string]> = [];
      for (const [, name] of named) {
        for (const el of document.querySelectorAll<HTMLElement>("[style*='view-transition-name']")) {
          if (el.style.viewTransitionName === name && !named.some(([n]) => n === el) && !el.closest("[data-layer='shell']")) others.push([el, name]);
        }
      }
      for (const [el] of others) el.style.viewTransitionName = "none";
      for (const [el, name] of named) el.style.viewTransitionName = name;
      for (const f of names.current) f();
      names.current = [
        ...named.map(([el]) => () => {
          el.style.viewTransitionName = "";
        }),
        ...others.map(([el, name]) => () => {
          if (el.isConnected) el.style.viewTransitionName = name;
        }),
      ];
      document.documentElement.setAttribute("data-shell", "open");
      withViewTransition(() => setShell({ data, href, from }));
      setTimeout(() => {
        for (const f of names.current) f();
        names.current = [];
      }, MOTION.travel + 60);
    };
    // A traversal (the phone's swipe, 9.7) while a shell is up: the shell goes at once, with nothing of its own.
    const onPop = () => {
      for (const f of names.current) f();
      names.current = [];
      setShell(null);
      setLeaving(false);
      document.documentElement.removeAttribute("data-shell");
    };
    // The screen a row opens is asked for when the finger lands (9.4): one request a touch, whole only while the router knows the route.
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const a = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>('a[data-press="row"], a[data-shell]') : null;
      const href = a?.getAttribute("href");
      const kind = touchKindOf(href);
      if (!a || !href || !kind || a.closest("[data-call-off-open]")) return;
      try {
        (router.prefetch as Prefetch)(href, { kind: touched(kind), onInvalidate: () => invalidated(kind) });
      } catch {
        // A router that will not prefetch: the tap asks as it always did.
      }
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("pointerdown", onDown, { capture: true, passive: true });
    window.addEventListener("popstate", onPop);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("popstate", onPop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the router is stable; the listeners read refs
  }, []);

  // A market's or a game's screen has landed: the router fetched its shape to get there, which the next touch can lean on.
  useEffect(() => {
    const kind = touchKindOf(pathname);
    if (kind) landedOn(kind);
  }, [pathname]);

  // The shell goes once the destination has landed (a fade over base), or at once when the path went elsewhere (back).
  useEffect(() => {
    if (!shell) return;
    if (pathname === pathOf(shell.href)) {
      const t1 = setTimeout(() => setLeaving(true), 0);
      const t2 = setTimeout(() => {
        setShell(null);
        setLeaving(false);
        document.documentElement.removeAttribute("data-shell");
      }, MOTION.base);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
    if (pathname !== shell.from) {
      const t = setTimeout(() => {
        setShell(null);
        document.documentElement.removeAttribute("data-shell");
      }, 0);
      return () => clearTimeout(t);
    }
  }, [pathname, shell]);

  if (!shell) return null;
  return <ShellView shell={shell.data} href={shell.href} leaving={leaving} retry={() => router.push(shell.href)} />;
}

function ShellView({ shell, href, leaving, retry }: { shell: Shell; href: string; leaving: boolean; retry: () => void }) {
  const stage = useWaitStage(!leaving);
  const hue = (h: string): Hue => ((HUES as readonly string[]).includes(h) ? (h as Hue) : "stone");
  return (
    <FixedLayer name="shell">
      {shell.kind === "market" ? <style data-ink-root={shell.ink} dangerouslySetInnerHTML={{ __html: inkStyleText(shell.ink) }} /> : null}
      <div data-shell-view={shell.kind} data-shell-stage={stage} data-fixed="top" className={`fixed inset-0 z-[25] flex flex-col overflow-hidden bg-ground pt-[env(safe-area-inset-top)] ${leaving ? "motion-fade-out" : ""}`}>
        {stage !== "none" ? <TopRunner state="running" /> : null}
        <div className="mx-auto flex w-full max-w-[430px] flex-1 flex-col px-5">
          <header className="flex h-14 items-center justify-between" data-top-bar="">
            <div className="flex min-w-0 items-center gap-2">
              {/* Back while the shell waits: the entry added at the tap is unwound, and the shell goes with it. */}
              <BackControl onBack={() => window.history.back()} />
            </div>
            <div className="flex items-center gap-1">{shell.kind === "market" ? <InfoIcon sheet={shell.state === "open" ? "market-open" : "market-voting"} /> : <InfoIcon sheet="game" />}</div>
          </header>
          <OfflineBar />
          <div className="flex flex-col gap-7 py-2">
            {shell.kind === "market" ? (
              <QuestionBand state={shell.state} clock={shell.clock} draft={shell.state === "draft"} mark={shell.mark} title={shell.question} asker={shell.asker ? { name: shell.asker.name, hue: hue(shell.asker.hue), line: shell.asker.line } : null} ink="var(--market-ink)" />
            ) : (
              <section className="-mx-2 flex flex-col gap-3 rounded-card bg-surface-2 p-4 pb-[18px]" data-game-header={shell.id} style={{ viewTransitionName: "market-ink" } as React.CSSProperties}>
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5">
                    <TeamStamp team={shell.away} size={44} travels="market-mark" />
                    <TeamStamp team={shell.home} size={44} travels="market-mark-2" />
                  </span>
                  <span className="text-label text-ink-2">{shell.start}</span>
                </div>
                <h1 className="text-serif-l text-ink">{shell.name}</h1>
              </section>
            )}
            {stage === "still" ? <p className="text-caption text-ink-3">Still going.</p> : null}
            {stage === "block" ? <ProblemSummary messages={[NOTHING_CAME_BACK]} retry={retry} /> : null}
          </div>
        </div>
      </div>
      {shell.kind === "market" && shell.sheet ? <PinnedSheet label={shell.sheet.label} low={<p className="text-body-strong text-ink">{shell.sheet.line}</p>} /> : null}
      <span hidden data-shell-href={href} />
    </FixedLayer>
  );
}
