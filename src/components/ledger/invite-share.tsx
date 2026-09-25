"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Every share goes out through the user's own composer (Web Share, then sms:), never from Dareful. */
export function InviteShare({ url, text, compact = false, primary = false, label, onShared }: { url: string; text: string; compact?: boolean; primary?: boolean; label?: string; onShared?: () => void }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ text: `${text} ${url}` });
        onShared?.();
        return;
      } catch {
        // fall through to sms:
      }
    }
    onShared?.();
    window.location.href = `sms:?&body=${encodeURIComponent(`${text} ${url}`)}`;
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copy this link", url);
    }
  }
  return (
    <div className="flex gap-2">
      <Button variant={primary ? "primary" : compact ? "tertiary" : "secondary"} onClick={share} className={primary ? "flex-1" : undefined}>
        {label ?? (primary ? "Send it to the chat" : compact ? "Send" : "Send the link")}
      </Button>
      <Button variant="tertiary" onClick={copy}>
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
