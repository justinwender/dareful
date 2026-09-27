"use client";

import { useEffect, useId, useState } from "react";
import { StateMark } from "@/components/ledger/state-mark";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { headsUpAnsweredAction } from "@/lib/actions/account";

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

/** How long after the screen arrives the ask waits: past the entering moment (3.13), never over it. */
const AFTER_MS = 2_400;

/**
 * "Want a heads-up?" (docs/design.md 4.10, `Explainers` frame 3): the one ask for the phone's permission, shown
 * once, after someone first gets in, when a push would first be worth having. A modal sheet where the moment's
 * sheet would be: the bell, the question, two marked rows saying what it covers ("When it's your turn", "When
 * it's decided"), the chalk "Turn on notifications", which raises the phone's own prompt, and "No thanks". A no,
 * the phone's own no, or a dismissal ends it: the answer is kept on the account, so no phone asks again, and
 * email carries what push would have. It asks nothing on a device that cannot take a push at all (an iPhone
 * outside the installed app), and never in the same moment as the One tap ask (4.9), which goes first.
 */
export function HeadsUp() {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    let alive = true;
    const decide = async (): Promise<boolean> => {
      if (!vapid) return false;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return false;
      if (Notification.permission === "denied") return false;
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && (await reg.pushManager.getSubscription())) return false;
      return true;
    };
    const t = setTimeout(() => {
      decide().then((ask) => alive && ask && setOpen(true), () => undefined);
    }, AFTER_MS);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [vapid]);

  async function answered() {
    setOpen(false);
    await headsUpAnsweredAction().catch(() => undefined);
  }
  async function turnOn() {
    if (!vapid) return answered();
    setWorking(true);
    try {
      if ((await Notification.requestPermission()) === "granted") {
        const reg = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapid) }));
        await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      }
    } catch {
      // The phone's own no, or a subscription that failed: either way the ask is over, and email carries it.
    } finally {
      setWorking(false);
      await answered();
    }
  }

  return (
    <Sheet open={open} onClose={() => void answered()} labelledBy={titleId}>
      <div className="flex flex-col gap-5" data-heads-up="">
        <div className="flex items-center gap-3">
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ink">
            <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
            <path d="M10 20a2 2 0 0 0 4 0" />
          </svg>
          <h2 id={titleId} className="text-body-strong text-ink">
            Want a heads-up?
          </h2>
        </div>
        <ul className="flex flex-col gap-3">
          <li className="flex items-center gap-3 text-body text-ink">
            <StateMark state="voting" />
            <span>When it’s your turn</span>
          </li>
          <li className="flex items-center gap-3 text-body text-ink">
            <StateMark state="resolved" ink="var(--ink)" />
            <span>When it’s decided</span>
          </li>
        </ul>
        <div className="flex flex-col gap-1">
          <Button variant="primary" data-autofocus onClick={turnOn} loading={working}>
            Turn on notifications
          </Button>
          <Button variant="tertiary" onClick={() => void answered()} disabled={working}>
            No thanks
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
