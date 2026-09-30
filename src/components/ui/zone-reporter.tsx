"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { storedZone, zoneCookie, zoneToReport } from "@/lib/ui/zone-report";

/**
 * Tells the server the viewer's zone once per browser (`zone-report.ts`), and when the screen on the page was
 * drawn before the server knew it, asks for it again so every clock on it reads in the right zone. Once per
 * page load at most, and never when the cookie cannot be kept (then a second draw would say the same thing).
 */
export function ZoneReporter() {
  const router = useRouter();
  const reported = useRef(false);
  useEffect(() => {
    if (reported.current) return;
    reported.current = true;
    const mine = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const zone = zoneToReport(document.cookie, mine);
    if (!zone) return;
    document.cookie = zoneCookie(zone);
    if (storedZone(document.cookie) === zone) router.refresh();
  }, [router]);
  return null;
}
