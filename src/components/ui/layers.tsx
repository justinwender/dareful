"use client";

import { createContext, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { FixedLayerName } from "@/lib/ui/layers";

/**
 * The layers (docs/design.md 9.3): the app root holds the page and, after it, one host for every fixed layer.
 * A fixed layer renders in place on the server, so the first frame and the markup a test reads have it, and on
 * the client it is portalled into the host, where no page ancestor can become its containing block. Each layer
 * carries its `view-transition-name`, so a transition never drags it along inside the page's snapshot (9.7).
 */
export const LAYERS_ID = "layers";

/** Inside a layer that scrolls on its own (the ask layer, 9.5), the pinned sheet sits in flow at its foot rather than fixed. */
export const InFlowSheets = createContext(false);

const never = () => () => {};
const hostOnClient = (): HTMLElement | null => document.getElementById(LAYERS_ID);
const hostOnServer = (): HTMLElement | null => null;

/** Where the fixed layers live once the page is hydrated; null on the server and until then. */
export function useLayersHost(): HTMLElement | null {
  return useSyncExternalStore(never, hostOnClient, hostOnServer);
}

export function FixedLayer({ name, children }: { name: FixedLayerName; children: ReactNode }) {
  const host = useLayersHost();
  const layer = (
    <div data-layer={name} style={{ viewTransitionName: name, display: "contents" } as CSSProperties}>
      {children}
    </div>
  );
  return host ? createPortal(layer, host) : layer;
}

/**
 * The host, rendered once by the root layout after the page: the grain over the ground (1.1, one fixed layer
 * the page's content sits over), the band behind the translucent status bar (the ground with its grain, which on
 * a market's own screen is that market's ground, since the market swaps `--ground` on `html`), and then whatever
 * the page portals in. Every fixed box says which edge it is pinned to (`data-fixed`), which is how it is put
 * back on the glass when the phone's viewport is out of step (`viewport.ts`): by a translate on itself.
 */
export function LayersRoot() {
  return (
    <>
      <div aria-hidden="true" data-layer="grain" data-fixed="top" className="grain-tile pointer-events-none fixed inset-0 -z-10" style={{ viewTransitionName: "grain" } as CSSProperties} />
      <div aria-hidden="true" data-layer="status-band" data-fixed="top" data-status-band="" className="grain fixed inset-x-0 top-0 z-20 h-[env(safe-area-inset-top)]" style={{ viewTransitionName: "status-band" } as CSSProperties} />
      {/* Two probes, fixed like the layers and drawing nothing: where they land against the glass is how the guard knows the phone's viewport is out of step (`viewport.ts`). They never move. */}
      <div aria-hidden="true" data-viewport-probe="top" className="pointer-events-none invisible fixed top-0 left-0 h-0 w-0" />
      <div aria-hidden="true" data-viewport-probe="bottom" className="pointer-events-none invisible fixed bottom-0 left-0 h-0 w-0" />
      <div id={LAYERS_ID} data-layer-root="" />
    </>
  );
}
