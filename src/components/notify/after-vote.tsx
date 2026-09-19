"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { InviteShare } from "@/components/ledger/invite-share";

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

type PushState = "unknown" | "unsupported" | "needs-install" | "ask" | "on" | "blocked";

/**
 * The screen after a vote (PLANNING.md 8d). Two things, both the voter's to do or not: relay it to the chat in
 * their own words from their own number, which reaches everyone actually in the conversation; and let this
 * device be told when it is decided. The ask comes here, after they have done something, and never on arrival.
 * On an iPhone, Web Push exists only in the installed app, so a tab says that and asks for nothing.
 */
export function AfterVote({ relay, url }: { relay: string | null; url: string }) {
  const [push, setPush] = useState<PushState>("unknown");
  const [working, setWorking] = useState(false);
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    const decide = async (): Promise<PushState> => {
      if (!vapid) return "unsupported";
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return ios && !standalone ? "needs-install" : "unsupported";
      if (Notification.permission === "denied") return "blocked";
      const reg = await navigator.serviceWorker.getRegistration();
      return reg && (await reg.pushManager.getSubscription()) ? "on" : "ask";
    };
    decide().then(setPush, () => setPush("unsupported"));
  }, [vapid]);

  async function turnOn() {
    if (!vapid) return;
    setWorking(true);
    try {
      if ((await Notification.requestPermission()) !== "granted") return setPush("blocked");
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapid) }));
      const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      setPush(res.ok ? "on" : "ask");
    } catch {
      setPush("ask");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-card border border-line bg-surface px-4 py-[14px]">
      {relay ? (
        <div className="flex flex-col gap-2">
          <p className="text-body-strong text-ink">Tell the others it’s their turn</p>
          <p className="text-body-sm text-ink-2">It goes from you, into whatever chat you pick. The link opens straight on the call.</p>
          <InviteShare url={url} text={relay} />
        </div>
      ) : null}
      {push === "ask" ? (
        <div className={relay ? "flex flex-col gap-2 border-t border-line pt-4" : "flex flex-col gap-2"}>
          <p className="text-body-sm text-ink-2">Want this phone to tell you when a friend calls one, and when it’s decided? Only when someone does something. Never because time passed.</p>
          <Button variant="secondary" onClick={turnOn} loading={working}>
            Tell me on this device
          </Button>
        </div>
      ) : null}
      {push === "needs-install" ? <p className={relay ? "border-t border-line pt-4 text-caption text-ink-3" : "text-caption text-ink-3"}>To be told on this iPhone: Share, then Add to Home Screen, and open Dareful from there. Until then it’s all under Needs you.</p> : null}
      {push === "on" ? <p className={relay ? "border-t border-line pt-4 text-caption text-ink-3" : "text-caption text-ink-3"}>This device will tell you when it’s decided.</p> : null}
    </div>
  );
}
