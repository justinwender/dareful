"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Every share goes out through the user's own composer (Web Share, then sms:), never from Dareful. */
export function InviteShare({ url, text }: { url: string; text: string }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ text: `${text} ${url}` });
        return;
      } catch {
        // fall through to sms:
      }
    }
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
      <Button variant="secondary" onClick={share}>
        Send the link
      </Button>
      <Button variant="tertiary" onClick={copy}>
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
